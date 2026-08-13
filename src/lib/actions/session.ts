"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { signOut } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/authz";
import { getOidcConfig, getPublicUrl, getSingleLogout } from "@/lib/settings";
import { buildLogoutUrl, fetchEndSessionEndpoint, postLogoutRedirectUri } from "@/lib/oidcLogout";

/**
 * Signs out of the portal, and of the identity provider with it.
 *
 * Order matters and is not negotiable: the portal's own session is destroyed
 * FIRST, before anything that can fail. Everything after — discovery, building
 * the URL, the provider honouring it — is best effort, so an unreachable or
 * misconfigured provider can leave someone on an ugly page but can never leave
 * them still signed in here.
 *
 * Only accounts that actually came from the provider are sent onward. The local
 * bootstrap admin has no provider session to end, and bouncing it through
 * Authentik would be a confusing detour on the one account that exists for when
 * Authentik is broken.
 */
export async function signOutEverywhere() {
  const user = await getCurrentUser();

  // Resolved before the session is destroyed, since it needs to know who this is.
  let providerLogout: string | null = null;

  const row = user ? await db.query.users.findFirst({ where: eq(users.id, user.id) }) : null;

  if (row?.oidcSub) {
    const [oidc, enabled] = await Promise.all([getOidcConfig(), getSingleLogout()]);

    if (enabled && oidc.enabled) {
      const endSessionEndpoint = await fetchEndSessionEndpoint(oidc.issuer);

      if (endSessionEndpoint) {
        providerLogout = buildLogoutUrl({
          endSessionEndpoint,
          idToken: row.oidcIdToken,
          clientId: oidc.clientId,
          postLogoutRedirectUri: postLogoutRedirectUri(await currentOrigin()),
        });
      }
    }

    // The hint is single-use as far as we're concerned: it described a session
    // that is about to end, and keeping it would mean a later sign-out sending
    // the provider a hint for a session that no longer exists.
    await db.update(users).set({ oidcIdToken: null }).where(eq(users.id, row.id));
  }

  // Clears the cookie. `redirect: false` so control comes back here and the
  // provider hand-off below is reached.
  await signOut({ redirect: false });

  redirect(providerLogout ?? "/logged-out");
}

/**
 * The address the browser actually reached us on.
 *
 * Prefers the pinned public URL for the same reason sign-in does — behind a
 * proxy that rewrites Host, a header-derived origin is somewhere the browser
 * cannot come back to.
 */
async function currentOrigin(): Promise<string> {
  const pinned = await getPublicUrl();
  if (pinned) return pinned;

  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
