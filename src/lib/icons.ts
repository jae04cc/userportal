/**
 * A service's icon field holds either an image reference or a lucide icon name.
 *
 * This single predicate decides which, and BOTH the card renderer and the admin
 * picker use it. They previously each had their own test and disagreed: the
 * picker recognised uploaded icons (`/api/icons/…`), the card only recognised
 * absolute `http(s)://` URLs — so an uploaded logo previewed correctly in the
 * admin form and then rendered as the generic fallback on the portal.
 */
export function isImageIcon(icon: string | null | undefined): boolean {
  if (!icon) return false;
  const value = icon.trim();
  if (!value) return false;

  if (/^https?:\/\//i.test(value)) return true;

  // Site-relative paths cover uploaded icons. Protocol-relative ("//host/x")
  // is deliberately excluded — it points at another origin.
  return value.startsWith("/") && !value.startsWith("//");
}

/**
 * Matches exactly the URL shape `saveIconUpload` hands back for a file it wrote
 * to the uploads directory.
 *
 * Branding images are restricted to this shape rather than accepting any URL.
 * The logo is re-served as the app icon, which means reading it back off disk —
 * so it has to be a file we own, and the name has to be one that cannot walk out
 * of the uploads directory.
 */
const UPLOAD_PATH = /^\/api\/icons\/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/;

export function isUploadedIconPath(value: string | null | undefined): boolean {
  return typeof value === "string" && UPLOAD_PATH.test(value.trim());
}

/** The bare file name behind an uploaded-icon path, or null if it isn't one. */
export function uploadFileName(value: string | null | undefined): string | null {
  if (!isUploadedIconPath(value)) return null;
  return value!.trim().slice("/api/icons/".length);
}
