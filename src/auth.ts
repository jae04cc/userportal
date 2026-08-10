import NextAuth, { type DefaultSession, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db, ensureDbReady } from "@/lib/db";
import { appSettings, groups, userGroups, users } from "@/lib/db/schema";
import { getSetting, SETTING_KEYS } from "@/lib/settings";
import { eq } from "drizzle-orm";
import { verifyPassword } from "@/lib/password";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { generateId } from "@/lib/utils";

// ---------------------------------------------------------------------------
// The session deliberately carries ONLY the user id.
//
// Roles and group membership are resolved from SQLite on every request via
// getCurrentUser() in src/lib/authz.ts. If they lived in the JWT, an admin
// changing someone's groups would have no effect until that user next signed
// in — which contradicts the "changes take effect without a redeploy"
// requirement. A local SQLite lookup is sub-millisecond, so this is cheap.
// ---------------------------------------------------------------------------
declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

async function getOrCreateSecret(): Promise<string> {
  // Earliest DB touch in any request path — migrations and the bootstrap admin
  // are created here on first run.
  await ensureDbReady();

  const fromEnv = process.env.AUTH_SECRET;
  if (fromEnv) return fromEnv;

  const existing = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, "auth_secret"),
  });
  if (existing) return existing.value;

  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const secret = Buffer.from(bytes).toString("base64url");
  await db.insert(appSettings).values({ key: "auth_secret", value: secret }).onConflictDoNothing();
  return secret;
}

/**
 * The Authentik/OIDC provider is only registered when all three env vars are
 * present, so the portal runs perfectly well on local credentials alone until
 * you supply them. No code change is needed to switch it on.
 */
function oidcProvider(): NextAuthConfig["providers"][number] | null {
  const issuer = process.env.OIDC_ISSUER;
  const clientId = process.env.OIDC_CLIENT_ID;
  const clientSecret = process.env.OIDC_CLIENT_SECRET;
  if (!issuer || !clientId || !clientSecret) return null;

  return {
    id: "oidc",
    name: process.env.OIDC_DISPLAY_NAME ?? "Single sign-on",
    type: "oidc",
    issuer,
    clientId,
    clientSecret,
    authorization: { params: { scope: "openid profile email" } },
    // Trust the IdP's own account identity, not the email address.
    allowDangerousEmailAccountLinking: false,
  };
}

export const isOidcEnabled = Boolean(
  process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET
);

/** Set LOCAL_LOGIN_ENABLED=false once SSO is confirmed working to close the fallback. */
export const isLocalLoginEnabled = process.env.LOCAL_LOGIN_ENABLED !== "false";

export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  const secret = await getOrCreateSecret();

  const providers: NextAuthConfig["providers"] = [];

  const oidc = oidcProvider();
  if (oidc) providers.push(oidc);

  if (isLocalLoginEnabled) {
    providers.push(
      Credentials({
        id: "credentials",
        name: "Username and password",
        credentials: {
          username: { label: "Username", type: "text" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials, request) {
          const username = credentials?.username as string | undefined;
          const password = credentials?.password as string | undefined;
          if (!username || !password) return null;

          // Throttle password guessing: 10 tries per 5 minutes per IP. Returning
          // null surfaces as an ordinary "invalid credentials", so an attacker
          // can't distinguish a lockout from a wrong password.
          const headers = request?.headers ?? new Headers();
          if (!rateLimit(`login:${clientIp(headers)}`, 10, 5 * 60_000).ok) return null;

          const user = await db.query.users.findFirst({
            // Usernames are stored lowercase — logins are case-insensitive
            where: eq(users.username, username.trim().toLowerCase()),
          });
          if (!user || !user.passwordHash) return null;
          // Suspended accounts can't sign in at all, and the failure is
          // indistinguishable from a wrong password.
          if (!user.isActive) return null;

          const valid = await verifyPassword(password, user.passwordHash);
          if (!valid) return null;

          await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

          return { id: user.id, name: user.displayName ?? user.username };
        },
      })
    );
  }

  return {
    secret,
    trustHost: true,
    providers,
    callbacks: {
      /**
       * For OIDC sign-ins, find-or-create the local user row keyed on the
       * issuer's `sub`. An existing local account is NEVER auto-linked by
       * matching email — that's an account-takeover vector if the IdP ever
       * hands over an address it hasn't verified. Linking is done deliberately
       * by an admin setting oidc_sub from the admin area.
       */
      async signIn({ account, profile }) {
        if (account?.provider !== "oidc" || !profile?.sub) return true;

        const existing = await db.query.users.findFirst({
          where: eq(users.oidcSub, profile.sub),
        });

        if (existing) {
          if (!existing.isActive) return false;
          await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, existing.id));
          return true;
        }

        // First SSO sign-in: provision with no admin rights.
        const base = (profile.preferred_username as string | undefined) ?? profile.email ?? profile.sub;
        const username = await uniqueUsername(String(base).trim().toLowerCase());
        const newId = generateId();

        await db.insert(users).values({
          id: newId,
          username,
          passwordHash: null,
          oidcSub: profile.sub,
          displayName: (profile.name as string | undefined) ?? username,
          email: profile.email ?? null,
          isAdmin: false,
          isBootstrap: false,
          createdAt: new Date(),
          lastLoginAt: new Date(),
        });

        // Without this a brand-new SSO user lands on a near-empty portal, since
        // they'd only see services with "everyone" visibility.
        const defaultGroupId = await getSetting(SETTING_KEYS.defaultGroupId);
        if (defaultGroupId) {
          const group = await db.query.groups.findFirst({ where: eq(groups.id, defaultGroupId) });
          if (group) {
            await db.insert(userGroups).values({ userId: newId, groupId: group.id });
          }
        }

        return true;
      },

      async jwt({ token, user, account, profile }) {
        // `user` is only present on initial sign-in
        if (account?.provider === "oidc" && profile?.sub) {
          const row = await db.query.users.findFirst({ where: eq(users.oidcSub, profile.sub) });
          if (row) token.userId = row.id;
        } else if (user) {
          token.userId = user.id;
        }
        return token;
      },

      async session({ session, token }) {
        session.user.id = (token.userId as string | undefined) ?? "";
        return session;
      },
    },
    pages: {
      signIn: "/login",
    },
  };
});

/** Appends -2, -3, … if an SSO-derived username collides with an existing one. */
async function uniqueUsername(base: string): Promise<string> {
  const clean = base.replace(/\s+/g, "-") || "user";
  let candidate = clean;
  let n = 1;
  // Bounded loop — in practice this resolves on the first or second try.
  while (n < 100) {
    const clash = await db.query.users.findFirst({ where: eq(users.username, candidate) });
    if (!clash) return candidate;
    n += 1;
    candidate = `${clean}-${n}`;
  }
  return `${clean}-${generateId().slice(0, 6)}`;
}
