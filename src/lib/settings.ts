import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";

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

  kumaBaseUrl: "kuma_base_url",
  kumaStatusSlug: "kuma_status_slug",
  kumaShowUptime: "kuma_show_uptime",

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

export async function getSessionMaxAge(): Promise<number> {
  const raw = await getSetting(SETTING_KEYS.sessionMaxAge);
  const parsed = Number(raw);
  // Clamped: too short and people re-auth constantly; too long and removing
  // someone in Authentik takes weeks to bite.
  if (!Number.isFinite(parsed) || parsed < 300) return DEFAULT_SESSION_MAX_AGE;
  return Math.min(parsed, 30 * 24 * 60 * 60);
}
