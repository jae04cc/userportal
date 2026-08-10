"use server";

import { revalidatePath } from "next/cache";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { statusItems, statusItemGroups, type ServiceVisibility } from "@/lib/db/schema";
import { requireAdminApi } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import { generateId } from "@/lib/utils";
import { SETTING_KEYS, setSetting } from "@/lib/settings";
import { discoverMonitors } from "@/lib/status";

const VALID_VISIBILITY: ServiceVisibility[] = ["all", "groups", "admin"];

function refresh() {
  revalidatePath("/");
  revalidatePath("/admin", "layout");
}

function str(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

async function applyGroups(statusItemId: string, groupIds: string[]) {
  await db.delete(statusItemGroups).where(eq(statusItemGroups.statusItemId, statusItemId));
  if (groupIds.length === 0) return;
  await db.insert(statusItemGroups).values(groupIds.map((groupId) => ({ statusItemId, groupId })));
}

export async function createStatusItem(form: FormData) {
  const actor = await requireAdminApi();
  const label = str(form, "label");
  const monitorKey = str(form, "monitorKey");
  if (!label || !monitorKey) return;

  const raw = str(form, "visibility") as ServiceVisibility;
  const visibility = VALID_VISIBILITY.includes(raw) ? raw : "all";

  const [{ max }] = await db
    .select({ max: sql<number>`COALESCE(MAX(${statusItems.sortOrder}), -1)` })
    .from(statusItems);

  const id = generateId();
  const now = new Date();

  await db.insert(statusItems).values({
    id,
    label,
    monitorKey,
    visibility,
    sortOrder: max + 1,
    isEnabled: form.get("isEnabled") !== null,
    createdAt: now,
    updatedAt: now,
  });

  await applyGroups(id, form.getAll("groupIds").map(String));

  await recordAudit({
    actor,
    action: "create",
    entityType: "service",
    entityId: id,
    summary: `Added status tile "${label}" (${visibility})`,
  });
  refresh();
}

export async function updateStatusItem(form: FormData) {
  const actor = await requireAdminApi();
  const id = str(form, "id");
  const label = str(form, "label");
  const monitorKey = str(form, "monitorKey");
  if (!id || !label || !monitorKey) return;

  const raw = str(form, "visibility") as ServiceVisibility;
  const visibility = VALID_VISIBILITY.includes(raw) ? raw : "all";

  await db
    .update(statusItems)
    .set({
      label,
      monitorKey,
      visibility,
      isEnabled: form.get("isEnabled") !== null,
      updatedAt: new Date(),
    })
    .where(eq(statusItems.id, id));

  await applyGroups(id, form.getAll("groupIds").map(String));

  await recordAudit({
    actor,
    action: "update",
    entityType: "service",
    entityId: id,
    summary: `Updated status tile "${label}" (${visibility})`,
  });
  refresh();
}

export async function deleteStatusItem(form: FormData) {
  const actor = await requireAdminApi();
  const id = str(form, "id");
  if (!id) return;

  const existing = await db.query.statusItems.findFirst({ where: eq(statusItems.id, id) });
  if (!existing) return;

  await db.delete(statusItems).where(eq(statusItems.id, id));
  await recordAudit({
    actor,
    action: "delete",
    entityType: "service",
    entityId: id,
    summary: `Removed status tile "${existing.label}"`,
  });
  refresh();
}

export async function moveStatusItem(form: FormData) {
  const actor = await requireAdminApi();
  const id = str(form, "id");
  const direction = str(form, "direction");
  if (!id || (direction !== "up" && direction !== "down")) return;

  const all = await db
    .select()
    .from(statusItems)
    .orderBy(asc(statusItems.sortOrder), asc(statusItems.label));

  const index = all.findIndex((s) => s.id === id);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapWith < 0 || swapWith >= all.length) return;

  // Rewrite the whole list rather than swapping two values, so ordering stays
  // dense and correct even if it started out inconsistent.
  const reordered = [...all];
  [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];

  await Promise.all(
    reordered.map((s, i) =>
      db.update(statusItems).set({ sortOrder: i }).where(eq(statusItems.id, s.id))
    )
  );

  await recordAudit({
    actor,
    action: "reorder",
    entityType: "service",
    entityId: id,
    summary: `Moved status tile "${all[index].label}" ${direction}`,
  });
  refresh();
}

export async function setShowPing(form: FormData) {
  const actor = await requireAdminApi();
  const show = form.get("showPing") !== null;

  await setSetting(SETTING_KEYS.statusPaneShowPing, show ? "true" : "false");
  await recordAudit({
    actor,
    action: "update",
    entityType: "service",
    summary: `${show ? "Showed" : "Hid"} response time on status pane tiles`,
  });
  refresh();
}

export type ImportResult = { ok: boolean; message: string };

/** Adds tiles for the selected Kuma monitors, skipping any already on the pane. */
export async function importStatusItems(
  _prev: ImportResult | null,
  form: FormData
): Promise<ImportResult> {
  const actor = await requireAdminApi();

  const selected = form.getAll("monitorIds").map(String).filter(Boolean);
  if (selected.length === 0) return { ok: false, message: "Select at least one monitor." };

  const discovered = await discoverMonitors();
  const byId = new Map(discovered.map((m) => [m.id, m]));

  const existing = await db.select().from(statusItems);
  const taken = new Set(existing.map((s) => s.monitorKey));

  let [{ max }] = await db
    .select({ max: sql<number>`COALESCE(MAX(${statusItems.sortOrder}), -1)` })
    .from(statusItems);

  let created = 0;
  const now = new Date();

  for (const monitorId of selected) {
    const monitor = byId.get(monitorId);
    if (!monitor || taken.has(monitor.id) || taken.has(monitor.name)) continue;

    max += 1;
    await db.insert(statusItems).values({
      id: generateId(),
      label: monitor.name,
      // Bind by numeric id so renaming the monitor in Kuma doesn't break it.
      monitorKey: monitor.id,
      visibility: "admin",
      sortOrder: max,
      isEnabled: true,
      createdAt: now,
      updatedAt: now,
    });
    taken.add(monitor.id);
    created += 1;
  }

  if (created === 0) {
    return { ok: false, message: "Nothing added — every selected monitor is already on the pane." };
  }

  await recordAudit({
    actor,
    action: "create",
    entityType: "service",
    summary: `Added ${created} status tile(s) from Uptime Kuma`,
  });
  refresh();

  return {
    ok: true,
    message: `Added ${created} tile(s), admin-only for now. Set who can see each one below.`,
  };
}
