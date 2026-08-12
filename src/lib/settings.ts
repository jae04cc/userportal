import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { isUploadedIconPath } from "@/lib/icons";
import { parseCollapseAfter } from "@/lib/paneLayout";
import { normalizePublicOrigin } from "@/lib/urls";

/**
 * ALL runtime configuration lives in the database and is edited from the admin
 * area — there are no configuration environment variables.
 *
 * The only two exceptions are DATABASE_PATH and UPLOADS_DIR, which necessarily
 * stay in the environment: you can't read the location of the database out of
 * the database. Both have working defaults, so a normal deploy sets neither.
 *
 * Environment variables listed in ENV_SEEDS are read exactly once, on a fresh
 * database, to seed initial values. After that the database is authoritative
 * and the environment is ignored entirely — so editing a setting in the UI is
 * never silently reverted by a stale compose file.
 */
export const SETTING_KEYS = {
  motd: "motd",

  /** Shown in the title bar and, crucially, under the home-screen icon. */
  portalName: "portal_name",
  /** Icon accent colour — the fastest way to tell two installs apart. */
  portalAccent: "portal_accent",
  /** Uploaded square logo. Reused as the favicon and app icon. */
  portalLogo: "portal_logo",
  /** Whether that logo is ALSO drawn beside the greeting. Icon slots ignore this. */
  portalLogoInHeader: "portal_logo_in_header",
  /** Uploaded wide banner, shown across the top of the landing page. */
  portalBanner: "portal_banner",
  /** How tall the banner is allowed to be: "sm" | "md" | "lg". */
  portalBannerHeight: "portal_banner_height",

  kumaBaseUrl: "kuma_base_url",
  kumaStatusSlug: "kuma_status_slug",
  kumaShowUptime: "kuma_show_uptime",
  /** Show the response-time figure on status pane tiles. */
  statusPaneShowPing: "status_pane_show_ping",
  /** How many tiles sit side by side: "1" | "2" | "3". */
  statusPaneColumns: "status_pane_columns",
  /** Tiles shown before the rest collapse behind a toggle. "0" = never collapse. */
  statusPaneCollapseAfter: "status_pane_collapse_after",
  /** Service card layout per breakpoint: "detailed" | "compact". */
  serviceCardLayoutMobile: "service_card_layout_mobile",
  serviceCardLayoutDesktop: "service_card_layout_desktop",

  /**
   * The portal's own public origin, e.g. https://portal.example.com.
   *
   * Pins the address used to build sign-in callback and error URLs instead of
   * deriving it from the Host header, which a reverse proxy may rewrite to an
   * internal address the browser can't reach.
   */
  publicUrl: "public_url",

  oidcIssuer: "oidc_issuer",
  oidcClientId: "oidc_client_id",
  oidcClientSecret: "oidc_client_secret",
  oidcDisplayName: "oidc_display_name",
  /** Token claim carrying the user's groups. */
  oidcGroupsClaim: "oidc_groups_claim",
  /** Membership of this IdP group grants portal admin. */
  oidcAdminGroup: "oidc_admin_group",

  /** Applied only when the IdP sends no groups at all. */
  defaultGroupId: "default_group_id",
  /** Session lifetime in seconds — how fast IdP deprovisioning propagates. */
  sessionMaxAge: "session_max_age",

  seeded: "env_seeded",
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

/** Keys whose values must never appear in logs or the audit trail. */
export const SECRET_KEYS: SettingKey[] = [SETTING_KEYS.oidcClientSecret];

export async function getSettings(keys: SettingKey[]): Promise<Record<string, string>> {
  if (keys.length === 0) return {};
  const rows = await db.select().from(appSettings).where(inArray(appSettings.key, keys));
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function getSetting(key: SettingKey): Promise<string | null> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, key) });
  return row?.value ?? null;
}

export async function setSetting(key: SettingKey, value: string) {
  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
}

export async function setSettings(values: Partial<Record<SettingKey, string>>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    await setSetting(key as SettingKey, value);
  }
}

// ---------------------------------------------------------------------------
// One-time environment seeding
// ---------------------------------------------------------------------------

const ENV_SEEDS: Array<[SettingKey, string]> = [
  [SETTING_KEYS.kumaBaseUrl, "KUMA_BASE_URL"],
  [SETTING_KEYS.kumaStatusSlug, "KUMA_STATUS_SLUG"],
  [SETTING_KEYS.oidcIssuer, "OIDC_ISSUER"],
  [SETTING_KEYS.oidcClientId, "OIDC_CLIENT_ID"],
  [SETTING_KEYS.oidcClientSecret, "OIDC_CLIENT_SECRET"],
  [SETTING_KEYS.oidcDisplayName, "OIDC_DISPLAY_NAME"],
];

/**
 * Carries pre-existing environment configuration into the database on the first
 * boot after this change, then records that it's done so it never runs again.
 */
export async function seedFromEnvOnce() {
  if (await getSetting(SETTING_KEYS.seeded)) return;

  for (const [key, envName] of ENV_SEEDS) {
    const value = process.env[envName];
    if (value?.trim()) await setSetting(key, value.trim());
  }

  await setSetting(SETTING_KEYS.seeded, new Date().toISOString());
}

// ---------------------------------------------------------------------------
// Typed views over the raw settings
// ---------------------------------------------------------------------------

export type KumaConfig = {
  baseUrl: string;
  slug: string;
  showUptime: boolean;
  configured: boolean;
};

export async function getKumaConfig(): Promise<KumaConfig> {
  const saved = await getSettings([
    SETTING_KEYS.kumaBaseUrl,
    SETTING_KEYS.kumaStatusSlug,
    SETTING_KEYS.kumaShowUptime,
  ]);

  const baseUrl = (saved[SETTING_KEYS.kumaBaseUrl] ?? "").trim();
  const slug = (saved[SETTING_KEYS.kumaStatusSlug] ?? "").trim();
  const showUptime = (saved[SETTING_KEYS.kumaShowUptime] ?? "true") !== "false";

  return { baseUrl, slug, showUptime, configured: Boolean(baseUrl && slug) };
}

export const DEFAULT_GROUPS_CLAIM = "groups";
export const DEFAULT_SESSION_MAX_AGE = 8 * 60 * 60; // 8 hours

export type OidcConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  displayName: string;
  groupsClaim: string;
  adminGroup: string;
  /** True when issuer, client id and secret are all present. */
  enabled: boolean;
};

export async function getOidcConfig(): Promise<OidcConfig> {
  const saved = await getSettings([
    SETTING_KEYS.oidcIssuer,
    SETTING_KEYS.oidcClientId,
    SETTING_KEYS.oidcClientSecret,
    SETTING_KEYS.oidcDisplayName,
    SETTING_KEYS.oidcGroupsClaim,
    SETTING_KEYS.oidcAdminGroup,
  ]);

  const issuer = (saved[SETTING_KEYS.oidcIssuer] ?? "").trim();
  const clientId = (saved[SETTING_KEYS.oidcClientId] ?? "").trim();
  const clientSecret = (saved[SETTING_KEYS.oidcClientSecret] ?? "").trim();

  return {
    issuer,
    clientId,
    clientSecret,
    displayName: (saved[SETTING_KEYS.oidcDisplayName] ?? "").trim() || "Single sign-on",
    groupsClaim: (saved[SETTING_KEYS.oidcGroupsClaim] ?? "").trim() || DEFAULT_GROUPS_CLAIM,
    adminGroup: (saved[SETTING_KEYS.oidcAdminGroup] ?? "").trim(),
    enabled: Boolean(issuer && clientId && clientSecret),
  };
}

/**
 * The configured public origin, or null to fall back to the request's headers.
 *
 * Re-normalised on read so a value that predates validation, or one edited
 * directly in the database, still can't inject a path into the auth base.
 */
export async function getPublicUrl(): Promise<string | null> {
  try {
    return normalizePublicOrigin(await getSetting(SETTING_KEYS.publicUrl));
  } catch {
    // Read during auth config, which runs on requests that may arrive before
    // migrations have completed on a brand-new database.
    return null;
  }
}

export type PortalIdentity = { name: string; accent: string };

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

const DEFAULT_ACCENT = "#38bdf8";

export async function getPortalIdentity(): Promise<PortalIdentity> {
  let saved: Record<string, string> = {};

  try {
    saved = await getSettings([SETTING_KEYS.portalName, SETTING_KEYS.portalAccent]);
  } catch {
    // The root layout reads this for every page's metadata, including the
    // statically generated /_not-found — which runs at BUILD time, where there
    // is no database. Branding is not worth failing a build (or a request) for;
    // fall back to the defaults.
    return { name: "Portal", accent: DEFAULT_ACCENT };
  }

  const name = (saved[SETTING_KEYS.portalName] ?? "").trim() || "Portal";
  const rawAccent = (saved[SETTING_KEYS.portalAccent] ?? "").trim();
  // Only accept a plain hex colour — this value is interpolated into generated
  // images and into the manifest.
  const accent = /^#[0-9a-f]{6}$/i.test(rawAccent) ? rawAccent : DEFAULT_ACCENT;

  return { name, accent };
}

/**
 * Uploaded branding artwork.
 *
 * Both are optional and both are `/api/icons/…` paths written by the upload
 * endpoint — never arbitrary URLs, because the logo is read back off disk to be
 * re-served as the app icon.
 */
export type BannerHeight = "sm" | "md" | "lg";
export type Branding = {
  /** Square-ish mark used as the favicon and app icon. */
  logo: string | null;
  /**
   * Whether the logo is also drawn beside the greeting.
   *
   * Separate from `logo` because a banner often already contains the mark, and
   * repeating it beside the greeting reads as a mistake. Turning this off must
   * NOT disturb the favicon or the installed app icon, so the icon slots read
   * `logo` and ignore this flag entirely.
   */
  showLogoInHeader: boolean;
  /** Wide artwork shown across the top of the landing page. */
  banner: string | null;
  bannerHeight: BannerHeight;
};

export async function getBranding(): Promise<Branding> {
  let saved: Record<string, string> = {};

  try {
    saved = await getSettings([
      SETTING_KEYS.portalLogo,
      SETTING_KEYS.portalLogoInHeader,
      SETTING_KEYS.portalBanner,
      SETTING_KEYS.portalBannerHeight,
    ]);
  } catch {
    // Same reason as getPortalIdentity: this is read while generating metadata,
    // which happens at build time where there is no database.
    return { logo: null, showLogoInHeader: true, banner: null, bannerHeight: "md" };
  }

  const rawHeight = saved[SETTING_KEYS.portalBannerHeight];

  return {
    // Re-validated on read, not just on write: a value that predates the
    // validation, or one edited directly in the database, must not become an
    // arbitrary path for the icon route to open.
    logo: isUploadedIconPath(saved[SETTING_KEYS.portalLogo]) ? saved[SETTING_KEYS.portalLogo] : null,
    // Defaults to on: someone who uploads a logo and saves nothing else should
    // see it appear.
    showLogoInHeader: saved[SETTING_KEYS.portalLogoInHeader] !== "false",
    banner: isUploadedIconPath(saved[SETTING_KEYS.portalBanner])
      ? saved[SETTING_KEYS.portalBanner]
      : null,
    bannerHeight: rawHeight === "sm" || rawHeight === "lg" ? rawHeight : "md",
  };
}

export type CardLayout = "detailed" | "compact";

/**
 * "detailed" — icon beside a name and description, one card per row on a phone.
 * "compact"  — icon above a centred name, three across. Drops the description;
 *              there's no room for it at that width.
 *
 * Chosen independently per breakpoint, because the right answer genuinely
 * differs: compact suits a phone where three tiles fit a thumb's reach, while a
 * wide screen has room for descriptions.
 */
export type CardLayouts = { mobile: CardLayout; desktop: CardLayout };

function parseLayout(raw: string | null, fallback: CardLayout): CardLayout {
  if (raw === "compact") return "compact";
  if (raw === "detailed") return "detailed";
  return fallback;
}

export async function getServiceCardLayouts(): Promise<CardLayouts> {
  const saved = await getSettings([
    SETTING_KEYS.serviceCardLayoutMobile,
    SETTING_KEYS.serviceCardLayoutDesktop,
  ]);

  return {
    mobile: parseLayout(saved[SETTING_KEYS.serviceCardLayoutMobile] ?? null, "compact"),
    desktop: parseLayout(saved[SETTING_KEYS.serviceCardLayoutDesktop] ?? null, "detailed"),
  };
}

export type PaneColumns = 1 | 2 | 3;

/** Defaults to 2 — the pane is a glanceable strip, not the focus of the page. */
export async function getStatusPaneColumns(): Promise<PaneColumns> {
  const raw = await getSetting(SETTING_KEYS.statusPaneColumns);
  const parsed = Number(raw);
  return parsed === 1 || parsed === 2 || parsed === 3 ? (parsed as PaneColumns) : 2;
}

export async function getStatusPaneCollapseAfter(): Promise<number> {
  return parseCollapseAfter(await getSetting(SETTING_KEYS.statusPaneCollapseAfter));
}

export async function getSessionMaxAge(): Promise<number> {
  const raw = await getSetting(SETTING_KEYS.sessionMaxAge);
  const parsed = Number(raw);
  // Clamped: too short and people re-auth constantly; too long and removing
  // someone in Authentik takes weeks to bite.
  if (!Number.isFinite(parsed) || parsed < 300) return DEFAULT_SESSION_MAX_AGE;
  return Math.min(parsed, 30 * 24 * 60 * 60);
}
