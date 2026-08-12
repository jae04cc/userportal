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
 * The portal's own public address, reduced to a bare origin.
 *
 * Auth.js builds callback and error URLs from the incoming Host header. Behind a
 * proxy that rewrites Host to the upstream address, that produces URLs pointing
 * at an internal address the browser cannot reach — which is what turned a
 * sign-in failure into a dead "https://0.0.0.0:5175/…" page. Setting this pins
 * the origin instead of trusting the header.
 *
 * The result is always an origin with no path. A trailing path would be read by
 * Auth.js as a basePath and quietly move every auth route.
 */
export function normalizePublicOrigin(raw: string | null | undefined): string | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (!ALLOWED_SCHEMES.includes(url.protocol)) return null;
    // `origin` drops any path, query and fragment, and normalises a default port.
    return url.origin;
  } catch {
    return null;
  }
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
