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
