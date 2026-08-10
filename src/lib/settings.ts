import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";

/**
 * Runtime configuration lives in the database, not the environment, so it can be
 * changed from the admin area without a redeploy. Environment variables act as
 * the initial default only — once a value is saved in the DB, the DB wins.
 */
export const SETTING_KEYS = {
  motd: "motd",
  kumaBaseUrl: "kuma_base_url",
  kumaStatusSlug: "kuma_status_slug",
  kumaShowUptime: "kuma_show_uptime",
  defaultGroupId: "default_group_id",
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

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

export type KumaConfig = {
  baseUrl: string;
  slug: string;
  showUptime: boolean;
  /** True when both baseUrl and slug are present, i.e. status can be fetched. */
  configured: boolean;
};

export async function getKumaConfig(): Promise<KumaConfig> {
  const saved = await getSettings([
    SETTING_KEYS.kumaBaseUrl,
    SETTING_KEYS.kumaStatusSlug,
    SETTING_KEYS.kumaShowUptime,
  ]);

  // Env vars seed the initial value but never override a saved one, so an admin
  // editing this in the UI isn't silently reverted by a stale compose file.
  const baseUrl = (saved[SETTING_KEYS.kumaBaseUrl] ?? process.env.KUMA_BASE_URL ?? "").trim();
  const slug = (saved[SETTING_KEYS.kumaStatusSlug] ?? process.env.KUMA_STATUS_SLUG ?? "").trim();
  const showUptime = (saved[SETTING_KEYS.kumaShowUptime] ?? "true") !== "false";

  return { baseUrl, slug, showUptime, configured: Boolean(baseUrl && slug) };
}
