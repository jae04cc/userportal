/**
 * Pure helpers for turning an OIDC token's claims into portal state.
 *
 * Kept free of DB access so the rules can be exhaustively unit tested — this is
 * the code that decides who is an admin, so it should be the best-tested code
 * in the project.
 */

/**
 * Reads the groups claim, which IdPs render inconsistently: an array of strings
 * is the common case, but a single string and a space/comma-delimited string
 * both occur in the wild. Anything unrecognisable yields no groups, which fails
 * closed.
 */
export function extractGroups(claims: Record<string, unknown>, claimName: string): string[] {
  const raw = claims[claimName];

  if (Array.isArray(raw)) {
    return dedupe(raw.filter((g): g is string => typeof g === "string" && g.trim() !== ""));
  }

  if (typeof raw === "string" && raw.trim()) {
    // A lone group name has no delimiter and survives this split unchanged.
    return dedupe(
      raw
        .split(/[,\s]+/)
        .map((g) => g.trim())
        .filter(Boolean)
    );
  }

  return [];
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()))];
}

/**
 * Admin is granted purely by membership of the configured IdP group.
 *
 * Comparison is case-insensitive because Authentik group names are
 * display-cased and an admin typing "Portal Admins" should match "portal
 * admins". If no admin group is configured, no IdP user is an admin — failing
 * closed, since the local bootstrap account is always available as the way back in.
 */
export function isAdminFromGroups(groups: string[], adminGroup: string): boolean {
  const target = adminGroup.trim().toLowerCase();
  if (!target) return false;
  return groups.some((g) => g.trim().toLowerCase() === target);
}

/**
 * Resolves the portal groups a user should have after signing in.
 *
 * The IdP is the sole source of truth: whatever the claim says replaces whatever
 * the portal previously stored. The configured default group applies ONLY when
 * the claim carries no groups at all — otherwise a default would be silently
 * re-added on every login and quietly contradict the IdP.
 */
export function resolveGroupNames(
  claimGroups: string[],
  defaultGroupName: string | null
): string[] {
  if (claimGroups.length > 0) return claimGroups;
  if (defaultGroupName?.trim()) return [defaultGroupName.trim()];
  return [];
}

/** Case-insensitive name match, used to bind claim names to existing group rows. */
export function normaliseGroupName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Derives the display name from standard OIDC claims, falling back through the
 * options an IdP might actually populate.
 */
export function resolveDisplayName(
  claims: Record<string, unknown>,
  fallback: string
): string {
  for (const key of ["name", "preferred_username", "nickname", "email"]) {
    const value = claims[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

/** Derives a portal username from the claims, preferring stable human-readable ones. */
export function resolveUsername(claims: Record<string, unknown>, fallback: string): string {
  for (const key of ["preferred_username", "email", "nickname"]) {
    const value = claims[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim().toLowerCase().replace(/\s+/g, "-");
    }
  }
  return fallback;
}
