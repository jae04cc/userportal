/**
 * Marks that single sign-on was just started automatically.
 *
 * Shared between the route that starts the flow and the login page that decides
 * whether to start it, so the two can never disagree about the name.
 *
 * It exists to break a loop: an account the identity provider happily
 * authenticates but the portal refuses — a suspended user, typically — arrives
 * back at /login looking exactly like a fresh visitor, and would be sent off to
 * the IdP again, forever. Short-lived, so a genuine retry a minute later still
 * starts automatically.
 */
export const SSO_ATTEMPT_COOKIE = "portal_sso_attempt";

export const SSO_ATTEMPT_TTL_SECONDS = 60;
