"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, services, serviceGroups, type ServiceVisibility } from "@/lib/db/schema";
import { requireAdminApi } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import { setMotd } from "@/lib/services";
import { generateId } from "@/lib/utils";
import { safeUrlOrNull, isSafeIcon } from "@/lib/urls";

/**
 * Every action here starts with requireAdminApi(). Server actions are publicly
 * callable POST endpoints — hiding the admin UI does nothing on its own.
 *
 * Each mutation revalidates "/" so changes are live on the landing page with no
 * restart and no redeploy.
 */

function refresh() {
  revalidatePath("/");
  revalidatePath("/admin", "layout");
}

const VALID_VISIBILITY: ServiceVisibility[] = ["all", "groups", "admin"];

function str(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function optionalStr(form: FormData, key: string): string | null {
  const value = str(form, key);
  return value.length > 0 ? value : null;
}

// ---------------------------------------------------------------------------
// MOTD
// ---------------------------------------------------------------------------

export async function updateMotd(form: FormData) {
  const actor = await requireAdminApi();
  const value = String(form.get("motd") ?? "");

  await setMotd(value);
  await recordAudit({
    actor,
    action: "update",
    entityType: "motd",
    summary: value.trim() ? "Updated the message of the day" : "Cleared the message of the day",
  });
  refresh();
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function createCategory(form: FormData) {
  const actor = await requireAdminApi();
  const name = str(form, "name");
  if (!name) return;

  const [{ max }] = await db
    .select({ max: sql<number>`COALESCE(MAX(${categories.sortOrder}), -1)` })
    .from(categories);

  const id = generateId();
  await db.insert(categories).values({
    id,
    name,
    sortOrder: max + 1,
    createdAt: new Date(),
  });

  await recordAudit({
    actor,
    action: "create",
    entityType: "category",
    entityId: id,
    summary: `Created category "${name}"`,
  });
  refresh();
}

export async function renameCategory(form: FormData) {
  const actor = await requireAdminApi();
  const id = str(form, "id");
  const name = str(form, "name");
  if (!id || !name) return;

  await db.update(categories).set({ name }).where(eq(categories.id, id));
  await recordAudit({
    actor,
    action: "update",
    entityType: "category",
    entityId: id,
    summary: `Renamed category to "${name}"`,
  });
  refresh();
}

export async function deleteCategory(form: FormData) {
  const actor = await requireAdminApi();
  const id = str(form, "id");
  if (!id) return;

  const existing = await db.query.categories.findFirst({ where: eq(categories.id, id) });
  if (!existing) return;

  // Services in this category cascade-delete with it (FK ON DELETE CASCADE).
  await db.delete(categories).where(eq(categories.id, id));
  await recordAudit({
    actor,
    action: "delete",
    entityType: "category",
    entityId: id,
    summary: `Deleted category "${existing.name}" and its services`,
  });
  refresh();
}

export async function moveCategory(form: FormData) {
  const actor = await requireAdminApi();
  const id = str(form, "id");
  const direction = str(form, "direction");
  if (!id || (direction !== "up" && direction !== "down")) return;

  const all = await db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name));
  const index = all.findIndex((c) => c.id === id);
  if (index === -1) return;

  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= all.length) return;

  // Rewrite the whole list's sortOrder rather than swapping two values — that
  // keeps the ordering dense and correct even if it started out inconsistent.
  const reordered = [...all];
  [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];

  await Promise.all(
    reordered.map((c, i) => db.update(categories).set({ sortOrder: i }).where(eq(categories.id, c.id)))
  );

  await recordAudit({
    actor,
    action: "reorder",
    entityType: "category",
    entityId: id,
    summary: `Moved category "${all[index].name}" ${direction}`,
  });
  refresh();
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

async function applyServiceGroups(serviceId: string, groupIds: string[]) {
  await db.delete(serviceGroups).where(eq(serviceGroups.serviceId, serviceId));
  if (groupIds.length === 0) return;
  await db.insert(serviceGroups).values(groupIds.map((groupId) => ({ serviceId, groupId })));
}

export async function createService(form: FormData) {
  const actor = await requireAdminApi();
  const categoryId = str(form, "categoryId");
  const name = str(form, "name");
  // Reject anything that isn't http(s) or a relative path — a javascript: URL
  // here would become stored XSS on every user's landing page.
  const url = safeUrlOrNull(str(form, "url"));
  const icon = optionalStr(form, "icon");
  if (!categoryId || !name || !url) return;
  if (icon && !isSafeIcon(icon)) return;

  const rawVisibility = str(form, "visibility") as ServiceVisibility;
  const visibility = VALID_VISIBILITY.includes(rawVisibility) ? rawVisibility : "all";

  const [{ max }] = await db
    .select({ max: sql<number>`COALESCE(MAX(${services.sortOrder}), -1)` })
    .from(services)
    .where(eq(services.categoryId, categoryId));

  const id = generateId();
  const now = new Date();

  await db.insert(services).values({
    id,
    categoryId,
    name,
    description: optionalStr(form, "description"),
    icon,
    url,
    monitorKey: optionalStr(form, "monitorKey"),
    visibility,
    sortOrder: max + 1,
    isEnabled: form.get("isEnabled") !== null,
    createdAt: now,
    updatedAt: now,
  });

  await applyServiceGroups(id, form.getAll("groupIds").map(String));

  await recordAudit({
    actor,
    action: "create",
    entityType: "service",
    entityId: id,
    summary: `Created service "${name}" (${visibility})`,
  });
  refresh();
}

export async function updateService(form: FormData) {
  const actor = await requireAdminApi();
  const id = str(form, "id");
  const name = str(form, "name");
  const url = safeUrlOrNull(str(form, "url"));
  const icon = optionalStr(form, "icon");
  const categoryId = str(form, "categoryId");
  if (!id || !name || !url || !categoryId) return;
  if (icon && !isSafeIcon(icon)) return;

  const rawVisibility = str(form, "visibility") as ServiceVisibility;
  const visibility = VALID_VISIBILITY.includes(rawVisibility) ? rawVisibility : "all";

  await db
    .update(services)
    .set({
      categoryId,
      name,
      description: optionalStr(form, "description"),
      icon,
      url,
      monitorKey: optionalStr(form, "monitorKey"),
      visibility,
      isEnabled: form.get("isEnabled") !== null,
      updatedAt: new Date(),
    })
    .where(eq(services.id, id));

  await applyServiceGroups(id, form.getAll("groupIds").map(String));

  await recordAudit({
    actor,
    action: "update",
    entityType: "service",
    entityId: id,
    summary: `Updated service "${name}" (${visibility})`,
  });
  refresh();
}

export async function deleteService(form: FormData) {
  const actor = await requireAdminApi();
  const id = str(form, "id");
  if (!id) return;

  const existing = await db.query.services.findFirst({ where: eq(services.id, id) });
  if (!existing) return;

  await db.delete(services).where(eq(services.id, id));
  await recordAudit({
    actor,
    action: "delete",
    entityType: "service",
    entityId: id,
    summary: `Deleted service "${existing.name}"`,
  });
  refresh();
}

export async function moveService(form: FormData) {
  const actor = await requireAdminApi();
  const id = str(form, "id");
  const direction = str(form, "direction");
  if (!id || (direction !== "up" && direction !== "down")) return;

  const target = await db.query.services.findFirst({ where: eq(services.id, id) });
  if (!target) return;

  // Reordering is scoped within a category — moving past the end does nothing.
  const siblings = await db
    .select()
    .from(services)
    .where(eq(services.categoryId, target.categoryId))
    .orderBy(asc(services.sortOrder), asc(services.name));

  const index = siblings.findIndex((s) => s.id === id);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapWith < 0 || swapWith >= siblings.length) return;

  const reordered = [...siblings];
  [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];

  await Promise.all(
    reordered.map((s, i) => db.update(services).set({ sortOrder: i }).where(eq(services.id, s.id)))
  );

  await recordAudit({
    actor,
    action: "reorder",
    entityType: "service",
    entityId: id,
    summary: `Moved service "${target.name}" ${direction}`,
  });
  refresh();
}
