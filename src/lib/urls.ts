/**
 * Service and icon URLs are admin-authored and rendered straight into `href` /
 * `src`. Without a scheme check, `javascript:` or `data:text/html` would be a
 * stored-XSS vector — small blast radius today because only admins can save
 * one, but it costs nothing to close and stops it becoming real if service
 * submission is ever delegated.
 */
const ALLOWED_SCHEMES = ["http:", "https:"];

/** Relative paths ("/admin", "/foo/bar") are allowed — they can't carry a scheme. */
function isRelativePath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//");
}

export function isSafeUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (isRelativePath(trimmed)) return true;

  try {
    return ALLOWED_SCHEMES.includes(new URL(trimmed).protocol);
  } catch {
    return false;
  }
}

/**
 * Returns the URL if safe, otherwise null. Callers treat null as "reject the
 * save" rather than silently rewriting what the admin typed.
 */
export function safeUrlOrNull(value: string): string | null {
  const trimmed = value.trim();
  return isSafeUrl(trimmed) ? trimmed : null;
}

/**
 * Icons are either an uploaded/remote image URL or a lucide icon name. Only the
 * URL form needs checking; a bare name can't be a scheme.
 */
export function isSafeIcon(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (!trimmed.includes(":")) return true; // plain lucide name
  return isSafeUrl(trimmed);
}
