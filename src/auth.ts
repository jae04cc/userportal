import NextAuth, { type DefaultSession, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { and, asc, eq } from "drizzle-orm";
import { db, ensureDbReady } from "@/lib/db";
import { appSettings, groups, userGroups, users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/password";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { generateId } from "@/lib/utils";
import {
  getOidcConfig,
  getPublicUrl,
  getSessionMaxAge,
  getSetting,
  SETTING_KEYS,
} from "@/lib/settings";
import {
  extractGroups,
  isAdminFromGroups,
  normaliseGroupName,
  resolveDisplayName,
  resolveGroupNames,
  resolveUsername,
} from "@/lib/idpSync";

// ---------------------------------------------------------------------------
// The session deliberately carries ONLY the user id. Roles and group membership
// are resolved from SQLite on every request via getCurrentUser() in
// src/lib/authz.ts, so suspending an account or changing its access takes effect
// on that user's very next request.
// ---------------------------------------------------------------------------
declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

/**
 * Memoised for the life of the process. The auth config is rebuilt on every
 * request (that's what makes DB-driven OIDC settings take effect immediately),
 * so without this the secret would cost a database round trip on every single
 * request. It never changes while the process runs.
 */
let cachedSecret: string | null = null;

async function getOrCreateSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;

  const existing = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, "auth_secret"),
  });
  if (existing) {
    cachedSecret = existing.value;
    return cachedSecret;
  }

  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const secret = Buffer.from(bytes).toString("base64url");
  await db.insert(appSettings).values({ key: "auth_secret", value: secret }).onConflictDoNothing();
  cachedSecret = secret;
  return secret;
}

/**
 * Mirrors the IdP's groups onto the portal user.
 *
 * Only IdP-sourced memberships are replaced. Anything an admin assigned in the
 * portal is left alone, so the two sources coexist: effective membership is the
 * union. A claim naming a group that already exists here simply joins the user
 * to that existing group — matched case-insensitively by name — and a claim
 * naming an unknown group creates it.
 *
 * Admin rights still come purely from the configured admin group. The local
 * bootstrap account is exempt: it keeps its own is_admin flag, which is what
 * stops a broken IdP config locking everyone out.
 */
async function syncFromClaims(userId: string, claims: Record<string, unknown>) {
  const config = await getOidcConfig();

  const claimGroups = extractGroups(claims, config.groupsClaim);
  const isAdmin = isAdminFromGroups(claimGroups, config.adminGroup);

  // The default group applies only when the IdP sent no groups at all.
  let defaultGroupName: string | null = null;
  const defaultGroupId = await getSetting(SETTING_KEYS.defaultGroupId);
  if (defaultGroupId) {
    const row = await db.query.groups.findFirst({ where: eq(groups.id, defaultGroupId) });
    defaultGroupName = row?.name ?? null;
  }

  const wanted = resolveGroupNames(claimGroups, defaultGroupName);

  const existing = await db.select().from(groups).orderBy(asc(groups.name));
  const byName = new Map(existing.map((g) => [normaliseGroupName(g.name), g]));

  const groupIds: string[] = [];
  for (const name of wanted) {
    const key = normaliseGroupName(name);
    let group = byName.get(key);
    if (!group) {
      group = {
        id: generateId(),
        name,
        description: "Created automatically from an identity provider group.",
        sortOrder: existing.length + groupIds.length,
        createdAt: new Date(),
      };
      await db.insert(groups).values(group);
      byName.set(key, group);
    }
    groupIds.push(group.id);
  }

  // Replace only what the IdP previously granted. Portal-assigned rows survive.
  await db
    .delete(userGroups)
    .where(and(eq(userGroups.userId, userId), eq(userGroups.source, "idp")));

  if (groupIds.length > 0) {
    await db
      .insert(userGroups)
      .values(groupIds.map((groupId) => ({ userId, groupId, source: "idp" as const })))
      // If an admin already granted this group here, keep it as the stronger
      // 'portal' assignment rather than downgrading it to one the next sync
      // could revoke.
      .onConflictDoNothing();
  }

  await db.update(users).set({ isAdmin, lastLoginAt: new Date() }).where(eq(users.id, userId));
}

export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  // Runs per request (next-auth's lazy initialisation), so OIDC settings saved
  // in the admin area take effect immediately with no restart.
  await ensureDbReady();

  const [secret, oidc, maxAge, publicUrl] = await Promise.all([
    getOrCreateSecret(),
    getOidcConfig(),
    getSessionMaxAge(),
    getPublicUrl(),
  ]);

  /**
   * Pin the origin used for callback and error URLs.
   *
   * next-auth reads AUTH_URL from the environment per request (`reqWithEnvURL`),
   * and this config function is awaited BEFORE that read happens — so assigning
   * it here applies to the very request being handled. It goes through the
   * environment because that is the only override the library offers; there is
   * no config field for it.
   *
   * Without this the origin comes from the Host header. A proxy that rewrites
   * Host to the upstream address then produces callback and error URLs pointing
   * somewhere the browser cannot reach.
   *
   * Deleted rather than left stale when unset, so clearing the setting really
   * does return to header-derived behaviour.
   */
  if (publicUrl) {
    process.env.AUTH_URL = publicUrl;
  } else {
    delete process.env.AUTH_URL;
  }

  const providers: NextAuthConfig["providers"] = [];

  if (oidc.enabled) {
    providers.push({
      id: "oidc",
      name: oidc.displayName,
      type: "oidc",
      issuer: oidc.issuer,
      clientId: oidc.clientId,
      clientSecret: oidc.clientSecret,
      authorization: { params: { scope: "openid profile email groups" } },
      // Identity is bound by the IdP's subject, never by a matching email.
      allowDangerousEmailAccountLinking: false,
    });
  }

  // The local credentials provider is ALWAYS registered. It is the break-glass
  // path for the bootstrap admin — if it could be switched off, a bad OIDC
  // config would lock everyone out permanently. The login page hides it behind
  // a disclosure instead.
  providers.push(
    Credentials({
      id: "credentials",
      name: "Local account",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const username = credentials?.username as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!username || !password) return null;

        const headers = request?.headers ?? new Headers();
        if (!rateLimit(`login:${clientIp(headers)}`, 10, 5 * 60_000).ok) return null;

        const user = await db.query.users.findFirst({
          where: eq(users.username, username.trim().toLowerCase()),
        });
        // Only accounts with a local password hash can use this path, which in
        // practice means the bootstrap admin alone.
        if (!user?.passwordHash || !user.isActive) return null;
        if (!(await verifyPassword(password, user.passwordHash))) return null;

        await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
        return { id: user.id, name: user.displayName ?? user.username };
      },
    })
  );

  return {
    secret,
    trustHost: true,
    // Short by design: it's how fast deprovisioning in Authentik propagates,
    // since a JWT session can't be revoked server-side.
    session: { strategy: "jwt", maxAge },
    providers,
    callbacks: {
      /**
       * Find-or-create the local mirror of an IdP identity, keyed on `sub`, then
       * sync groups and admin rights from the token's claims.
       */
      async signIn({ account, profile }) {
        if (account?.provider !== "oidc" || !profile?.sub) return true;

        const claims = profile as unknown as Record<string, unknown>;
        const existing = await db.query.users.findFirst({
          where: eq(users.oidcSub, profile.sub),
        });

        if (existing) {
          if (!existing.isActive) return false;
          await db
            .update(users)
            .set({
              displayName: resolveDisplayName(claims, existing.displayName ?? existing.username),
              email: (profile.email as string | undefined) ?? existing.email,
            })
            .where(eq(users.id, existing.id));
          await syncFromClaims(existing.id, claims);
          return true;
        }

        const username = await uniqueUsername(resolveUsername(claims, profile.sub));
        const newId = generateId();

        await db.insert(users).values({
          id: newId,
          username,
          // IdP users never have a local password.
          passwordHash: null,
          oidcSub: profile.sub,
          displayName: resolveDisplayName(claims, username),
          email: (profile.email as string | undefined) ?? null,
          isAdmin: false,
          isBootstrap: false,
          createdAt: new Date(),
          lastLoginAt: new Date(),
        });

        await syncFromClaims(newId, claims);
        return true;
      },

      async jwt({ token, user, account, profile }) {
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

/** Appends -2, -3, … if an IdP-derived username collides with an existing one. */
async function uniqueUsername(base: string): Promise<string> {
  const clean = base.replace(/\s+/g, "-") || "user";
  let candidate = clean;
  let n = 1;
  while (n < 100) {
    const clash = await db.query.users.findFirst({ where: eq(users.username, candidate) });
    if (!clash) return candidate;
    n += 1;
    candidate = `${clean}-${n}`;
  }
  return `${clean}-${generateId().slice(0, 6)}`;
}
