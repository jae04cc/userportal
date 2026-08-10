"use server";

import { revalidatePath } from "next/cache";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, services } from "@/lib/db/schema";
import { requireAdminApi } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import { generateId } from "@/lib/utils";
import { safeUrlOrNull } from "@/lib/urls";
import { SETTING_KEYS, setSetting, getKumaConfig } from "@/lib/settings";
import { invalidateStatusCache, discoverMonitors } from "@/lib/status";
import { KumaStatusProvider } from "@/lib/status/kuma";

function refresh() {
  revalidatePath("/");
  revalidatePath("/admin", "layout");
}

function str(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

export type ActionResult = { ok: boolean; message: string };

/**
 * Saves the Uptime Kuma connection settings into the database, so monitoring can
 * be pointed somewhere new without touching env vars or redeploying.
 */
export async function saveKumaSettings(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const actor = await requireAdminApi();

  const rawBase = str(form, "baseUrl");
  const slug = str(form, "slug");
  const showUptime = form.get("showUptime") !== null;

  // Clearing both fields is a legitimate way to switch monitoring off.
  if (!rawBase && !slug) {
    await setSetting(SETTING_KEYS.kumaBaseUrl, "");
    await setSetting(SETTING_KEYS.kumaStatusSlug, "");
    invalidateStatusCache();
    await recordAudit({
      actor,
      action: "update",
      entityType: "motd",
      summary: "Disabled Uptime Kuma monitoring",
    });
    refresh();
    return { ok: true, message: "Monitoring disabled. Cards will no longer show status." };
  }

  const baseUrl = safeUrlOrNull(rawBase);
  if (!baseUrl) {
    return { ok: false, message: "The base URL must be a valid http:// or https:// address." };
  }
  if (!slug) {
    return { ok: false, message: "A status page slug is required." };
  }

  await setSetting(SETTING_KEYS.kumaBaseUrl, baseUrl);
  await setSetting(SETTING_KEYS.kumaStatusSlug, slug);
  await setSetting(SETTING_KEYS.kumaShowUptime, showUptime ? "true" : "false");
  // Without this the old server's results would keep serving for up to 20s.
  invalidateStatusCache();

  await recordAudit({
    actor,
    action: "update",
    entityType: "motd",
    summary: `Set Uptime Kuma to ${baseUrl} (status page "${slug}")`,
  });
  refresh();

  // Report the live result immediately rather than making them press Test.
  const result = await new KumaStatusProvider(baseUrl, slug).test();
  return {
    ok: result.ok,
    message: result.ok ? `Saved. ${result.message}` : `Saved, but: ${result.message}`,
  };
}

/** Explicit connection check against whatever is currently saved. */
export async function testKumaConnection(): Promise<ActionResult> {
  await requireAdminApi();
  const config = await getKumaConfig();
  if (!config.configured) {
    return { ok: false, message: "No Uptime Kuma URL and slug are configured yet." };
  }
  return new KumaStatusProvider(config.baseUrl, config.slug).test();
}

/**
 * Bulk-imports monitors from the configured Kuma status page.
 *
 * Services are bound to the monitor's numeric ID rather than its name, so
 * renaming a monitor in Kuma doesn't silently break the status indicator.
 * Kuma's own status-page groups become portal categories, which means an
 * existing status page layout carries over rather than being retyped.
 */
export async function importKumaMonitors(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const actor = await requireAdminApi();

  const selected = form.getAll("monitorIds").map(String).filter(Boolean);
  if (selected.length === 0) {
    return { ok: false, message: "Select at least one monitor to import." };
  }

  const discovered = await discoverMonitors();
  const byId = new Map(discovered.map((m) => [m.id, m]));

  const [existingServices, existingCategories] = await Promise.all([
    db.select().from(services),
    db.select().from(categories).orderBy(asc(categories.sortOrder)),
  ]);

  // Already-bound monitors are skipped rather than duplicated, so re-running an
  // import after adding monitors in Kuma only brings in what's new.
  const boundKeys = new Set(
    existingServices.map((s) => s.monitorKey).filter((k): k is string => Boolean(k))
  );
  const categoryByName = new Map(existingCategories.map((c) => [c.name.toLowerCase(), c]));

  let created = 0;
  let skipped = 0;
  const now = new Date();

  let [{ maxCategory }] = await db
    .select({ maxCategory: sql<number>`COALESCE(MAX(${categories.sortOrder}), -1)` })
    .from(categories);

  for (const monitorId of selected) {
    const monitor = byId.get(monitorId);
    if (!monitor) continue;

    if (boundKeys.has(monitor.id) || boundKeys.has(monitor.name)) {
      skipped += 1;
      continue;
    }

    let category = categoryByName.get(monitor.groupName.toLowerCase());
    if (!category) {
      maxCategory += 1;
      const newCategory = {
        id: generateId(),
        name: monitor.groupName,
        sortOrder: maxCategory,
        createdAt: now,
      };
      await db.insert(categories).values(newCategory);
      category = newCategory;
      categoryByName.set(monitor.groupName.toLowerCase(), newCategory);
    }

    const [{ maxService }] = await db
      .select({ maxService: sql<number>`COALESCE(MAX(${services.sortOrder}), -1)` })
      .from(services)
      .where(eq(services.categoryId, category.id));

    await db.insert(services).values({
      id: generateId(),
      categoryId: category.id,
      name: monitor.name,
      description: null,
      icon: null,
      // Kuma's status page doesn't expose each monitor's target URL, so this is
      // a placeholder the admin edits after import. Deliberately disabled until
      // then, so a broken link never reaches a user's landing page.
      url: "/",
      monitorKey: monitor.id,
      visibility: "admin",
      sortOrder: maxService + 1,
      isEnabled: false,
      createdAt: now,
      updatedAt: now,
    });

    boundKeys.add(monitor.id);
    created += 1;
  }

  await recordAudit({
    actor,
    action: "create",
    entityType: "service",
    summary: `Imported ${created} monitor(s) from Uptime Kuma${skipped ? `, skipped ${skipped} already bound` : ""}`,
  });
  refresh();

  if (created === 0) {
    return { ok: false, message: "Nothing imported — every selected monitor is already bound." };
  }

  return {
    ok: true,
    message:
      `Imported ${created} service(s), disabled and admin-only. ` +
      `Set each one's URL on the Services tab, then enable it.` +
      (skipped ? ` Skipped ${skipped} already bound.` : ""),
  };
}
