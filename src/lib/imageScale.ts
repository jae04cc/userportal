/**
 * Sizing rules for uploaded branding artwork.
 *
 * Uploads are served verbatim into the icon slots — there is no server-side
 * rasteriser — so whatever an admin picks is exactly what a phone, a browser
 * tab and the web manifest get. That makes the upload the only place the size
 * can be fixed, and the browser is already holding a decoder for every format
 * the file input accepts.
 *
 * The ceiling is not arbitrary. Chrome ignores manifest icons larger than
 * 1024px when deciding whether a site is installable: measured directly against
 * this app, a 1024px icon is installable and a 1025px one reports
 * `manifest-missing-suitable-icon`. A logo above that ceiling is the only icon
 * the manifest declares, so it silently costs the install prompt entirely.
 */

/**
 * What uploaded logos are scaled down to.
 *
 * 512 rather than the 1024 ceiling because it is the largest size any icon slot
 * actually asks for, and it leaves the file an order of magnitude smaller — the
 * upload is served for the 64px favicon too, on every visit.
 */
export const MAX_ICON_PX = 512;

/** Chrome's upper bound for a manifest icon it will consider. Measured, not documented. */
export const CHROME_MAX_ICON_PX = 1024;

export type Size = { width: number; height: number };

/**
 * Fits within a square bound, preserving aspect ratio and never upscaling.
 *
 * Aspect is preserved rather than forcing a square: padding or cropping would
 * silently alter someone's artwork, and a non-square logo is legitimate
 * everywhere except the app-icon slot, which has its own rules.
 */
export function fitWithin(size: Size, max: number): Size {
  const longest = Math.max(size.width, size.height);
  if (longest <= max) return { width: size.width, height: size.height };

  const scale = max / longest;
  return {
    // Round, but never to zero — a 2000x1 image still has to have a height.
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

/**
 * Whether an upload needs re-rendering before it is stored.
 *
 * Two reasons, and only two. Anything already small enough and already a PNG is
 * passed through untouched — re-encoding it could only make it worse.
 */
export function needsRescale(
  { size, type }: { size: Size; type: string },
  max: number = MAX_ICON_PX
): boolean {
  // Too big: costs the install prompt, and bloats every page load.
  if (Math.max(size.width, size.height) > max) return true;
  // Not a PNG: the app-icon and apple-touch-icon slots are PNG-only, so
  // converting is what makes a JPEG or WebP logo usable there at all.
  if (type !== "image/png") return true;
  return false;
}

/** A human explanation of what was done, for the upload UI. */
export function describeRescale(from: Size, to: Size, converted: boolean): string {
  const resized = from.width !== to.width || from.height !== to.height;
  const dims = `${to.width}×${to.height}`;

  if (resized && converted) {
    return `Converted to PNG and resized from ${from.width}×${from.height} to ${dims}.`;
  }
  if (resized) return `Resized from ${from.width}×${from.height} to ${dims}.`;
  if (converted) return `Converted to PNG at ${dims}.`;
  return `Stored as uploaded, ${dims}.`;
}
