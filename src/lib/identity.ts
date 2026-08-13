/**
 * The portal's visual identity: its name, its icon accent, and the colour an
 * installed app paints its window chrome with.
 *
 * Kept apart from settings.ts, which is server-only, because these values are
 * written into generated files — the web manifest and the PNG icon — rather
 * than validated where they're used. A bad value there is baked in and served,
 * so the fallbacks and the hex check are worth testing directly.
 */

export type ThemeSource = "surface" | "accent";

export type PortalIdentity = {
  name: string;
  accent: string;
  themeSource: ThemeSource;
  /**
   * The resolved `theme_color`: the title bar on Windows, the status bar on
   * Android. A separate decision from the icon colour, and defaults to the
   * app's own background so the chrome disappears into the page.
   */
  themeColor: string;
};

/**
 * The page background, shared with `surface.base` in the Tailwind config and
 * with the generated icon's backdrop. Anything painting "the app's own colour"
 * must use this exact value or the seam shows.
 */
export const SURFACE_BASE = "#0b0f14";

/** Preset accents, so two installs are distinguishable at a glance on a home screen. */
export const ACCENT_PRESETS = [
  { value: "#38bdf8", label: "Sky" },
  { value: "#34d399", label: "Green" },
  { value: "#a78bfa", label: "Violet" },
  { value: "#fb923c", label: "Orange" },
  { value: "#f472b6", label: "Pink" },
  { value: "#facc15", label: "Yellow" },
  { value: "#f87171", label: "Red" },
  { value: "#94a3b8", label: "Slate" },
] as const;

export const DEFAULT_ACCENT = "#38bdf8";

export function resolveIdentity(raw: {
  name?: string | null;
  accent?: string | null;
  themeSource?: string | null;
}): PortalIdentity {
  const name = (raw.name ?? "").trim() || "Portal";

  // Only a plain hex colour: this is interpolated into generated images and
  // into the manifest, neither of which escapes what it is given.
  const rawAccent = (raw.accent ?? "").trim();
  const accent = /^#[0-9a-f]{6}$/i.test(rawAccent) ? rawAccent : DEFAULT_ACCENT;

  // Surface is the default, including for installs predating this setting: a
  // saturated title bar above a dark app reads as a glitch, not as branding.
  const themeSource: ThemeSource = (raw.themeSource ?? "").trim() === "accent" ? "accent" : "surface";

  return {
    name,
    accent,
    themeSource,
    themeColor: themeSource === "accent" ? accent : SURFACE_BASE,
  };
}
