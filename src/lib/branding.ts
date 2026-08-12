import "server-only";
import { cache } from "react";
import { getBranding } from "@/lib/settings";
import { uploadFileName } from "@/lib/icons";
import { readIcon } from "@/lib/uploads";
import { parsePngSize } from "@/lib/png";

/**
 * The uploaded logo, read back off disk so it can be re-served as the app icon.
 *
 * There is no image processing here — no decoding, no resizing, no padding. That
 * would mean a native rasteriser (sharp), which is a heavy dependency to add for
 * one branding feature, and the same one deliberately avoided in src/lib/png.ts.
 * The consequence is that the uploaded file is served verbatim, so what the admin
 * uploads is exactly what a phone shows. The admin UI says so, and the rules
 * below refuse the slots where serving it verbatim would misbehave.
 */

/**
 * Chrome will not offer to install a PWA unless an icon of at least 144px is
 * declared, so a logo smaller than that must not displace the generated icon —
 * it would silently make the app un-installable.
 */
export const MIN_ICON_PX = 144;

export type LogoFile = {
  body: Buffer;
  contentType: string;
  /** Dimensions, present only for PNG. Null means "not a PNG". */
  png: { width: number; height: number } | null;
};

/**
 * Cached per request: the root layout's metadata, the manifest and the icon
 * route can each ask for this while serving one page.
 */
export const readLogoFile = cache(async (): Promise<LogoFile | null> => {
  const { logo } = await getBranding();
  const fileName = uploadFileName(logo);
  if (!fileName) return null;

  // The file can be missing if it was deleted from the uploads directory
  // independently of the setting; readIcon returns null and we fall back.
  const file = await readIcon(fileName);
  if (!file) return null;

  return {
    body: file.body,
    contentType: file.contentType,
    png: file.contentType === "image/png" ? parsePngSize(file.body) : null,
  };
});

export type IconOverrides = {
  /** True when the upload takes over the favicon — any image format will do. */
  favicon: boolean;
  /**
   * Measured size when the upload takes over the home-screen and manifest
   * icons, null when those fall back to the generated mark.
   *
   * PNG only, because the slot that matters most is strict: Safari ignores SVG
   * for `apple-touch-icon` entirely, which is how an SVG-only setup ends up with
   * no home-screen icon at all on an iPhone.
   */
  app: { width: number; height: number } | null;
};

/**
 * Which icon slots the uploaded logo actually takes over.
 *
 * Metadata, the manifest and the icon route all decide from this one answer, so
 * a declared `sizes`/`type` can never disagree with the bytes served.
 */
export const getIconOverrides = cache(async (): Promise<IconOverrides> => {
  const file = await readLogoFile();
  if (!file) return { favicon: false, app: null };

  const usable = file.png && Math.min(file.png.width, file.png.height) >= MIN_ICON_PX;
  return { favicon: true, app: usable ? file.png : null };
});
