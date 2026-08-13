/**
 * RP-initiated logout: ending the identity provider's session, not just ours.
 *
 * Signing out of the portal only clears the portal's own cookie. The identity
 * provider's session survives, so the next visit sails straight back in through
 * SSO without a password — which, with the auto-SSO redirect on /login, means
 * "sign out" visibly does nothing. This is the other half.
 *
 * The URL construction is pure and separately testable because the failure mode
 * is silent: a malformed logout URL doesn't error, it just lands the user on a
 * provider error page having already been signed out locally.
 */

export type LogoutUrlInput = {
  /** `end_session_endpoint` from the provider's discovery document. */
  endSessionEndpoint: string;
  /** The user's last ID token, if we have one. Lets the provider skip its confirmation prompt. */
  idToken?: string | null;
  clientId?: string | null;
  /** Where the provider should send the browser afterwards. Must be registered with it. */
  postLogoutRedirectUri?: string | null;
};

/**
 * Builds the provider logout URL.
 *
 * Every parameter is optional per the spec, and each is omitted rather than
 * sent empty — an empty `post_logout_redirect_uri` is a validation error at most
 * providers, not a no-op.
 */
export function buildLogoutUrl({
  endSessionEndpoint,
  idToken,
  clientId,
  postLogoutRedirectUri,
}: LogoutUrlInput): string | null {
  let url: URL;
  try {
    url = new URL(endSessionEndpoint);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  if (idToken) url.searchParams.set("id_token_hint", idToken);
  if (clientId) url.searchParams.set("client_id", clientId);
  // Providers generally reject a redirect target that isn't registered, so this
  // is only sent when one is actually configured.
  if (postLogoutRedirectUri) {
    url.searchParams.set("post_logout_redirect_uri", postLogoutRedirectUri);
  }

  return url.toString();
}

/** Where the provider sends the browser once it has ended its session. */
export function postLogoutRedirectUri(origin: string): string | null {
  try {
    return new URL("/logged-out", origin).toString();
  } catch {
    return null;
  }
}

type Discovery = { end_session_endpoint?: unknown };

/**
 * Cached per issuer for the life of the process.
 *
 * Discovery documents are static in practice, and this is on the path of a user
 * pressing a button — a five second round trip to the IdP before their browser
 * moves is the difference between logout feeling instant and feeling broken.
 */
const endpointCache = new Map<string, string | null>();

/** Exposed for tests and for when an admin changes the issuer. */
export function clearEndSessionCache() {
  endpointCache.clear();
}

/**
 * Looks up `end_session_endpoint` from the issuer's discovery document.
 *
 * Returns null — never throws — when the provider is unreachable or doesn't
 * advertise the endpoint. Callers fall back to a local-only sign-out, because
 * the one thing that must never fail is ending the portal's own session.
 */
export async function fetchEndSessionEndpoint(issuer: string): Promise<string | null> {
  const base = issuer.replace(/\/+$/, "");
  if (endpointCache.has(base)) return endpointCache.get(base) ?? null;

  let endpoint: string | null = null;
  try {
    const res = await fetch(`${base}/.well-known/openid-configuration`, {
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (res.ok) {
      const doc = (await res.json()) as Discovery;
      if (typeof doc.end_session_endpoint === "string" && doc.end_session_endpoint) {
        endpoint = doc.end_session_endpoint;
      }
    }
  } catch {
    // Unreachable provider: nothing to do but sign out locally.
  }

  endpointCache.set(base, endpoint);
  return endpoint;
}
