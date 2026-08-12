import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { signIn } from "@/auth";
import { getCurrentUser } from "@/lib/authz";
import { getOidcConfig } from "@/lib/settings";
import { SSO_ATTEMPT_COOKIE, SSO_ATTEMPT_TTL_SECONDS } from "@/lib/sso";

export const dynamic = "force-dynamic";

/**
 * Starts the OIDC flow server-side, with no page in between.
 *
 * `signIn()` has to run in a route handler or a server action — it sets the
 * state and PKCE cookies — so the login page redirects here rather than
 * rendering a button and submitting it. Nothing is drawn at any point, which is
 * the whole objective: someone already signed in at the identity provider goes
 * straight to the portal without a login screen appearing, and it works with
 * JavaScript disabled.
 */
export async function GET(req: Request) {
  // Already signed in — nothing to start.
  if (await getCurrentUser()) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const oidc = await getOidcConfig();
  if (!oidc.enabled) {
    // No SSO configured, so the local form is the only way in.
    return NextResponse.redirect(new URL("/login?local=1", req.url));
  }

  cookies().set(SSO_ATTEMPT_COOKIE, "1", {
    maxAge: SSO_ATTEMPT_TTL_SECONDS,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  // Redirects to the identity provider; never returns normally.
  await signIn("oidc", { redirectTo: "/" });
}
