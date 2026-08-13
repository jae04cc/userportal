"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, services, serviceGroups, type ServiceVisibility } from "@/lib/db/schema";
import { requireAdminApi } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import { setMotd } from "@/lib/services";
import { SETTING_KEYS, setSetting, setSettings } from "@/lib/settings";
import { generateId } from "@/lib/utils";
import { safeUrlOrNull, isSafeIcon } from "@/lib/urls";
import { isUploadedIconPath } from "@/lib/icons";
import type { ServiceKind } from "@/lib/db/schema";

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

/**
 * Portal name and icon accent. These drive the generated PWA icon, the manifest
 * and the document title — i.e. how this install is told apart from another one
 * on the same phone's home screen.
 */
export async function updateIdentity(form: FormData) {
  const actor = await requireAdminApi();

  const name = str(form, "portalName").slice(0, 40);
  const accent = str(form, "portalAccent");
  if (!name) return;
  // Interpolated into generated images and the manifest — only plain hex.
  if (!/^#[0-9a-f]{6}$/i.test(accent)) return;
  // Anything other than the one opt-in value means the app's own background.
  const themeSource = str(form, "portalThemeSource") === "accent" ? "accent" : "surface";

  await setSetting(SETTING_KEYS.portalName, name);
  await setSetting(SETTING_KEYS.portalAccent, accent);
  await setSetting(SETTING_KEYS.portalThemeSource, themeSource);

  await recordAudit({
    actor,
    action: "update",
    entityType: "motd",
    summary: `Set portal name to "${name}" with accent ${accent} (window colour: ${themeSource})`,
  });
  refresh();
}

/**
 * Uploaded branding: the banner across the top of the landing page and the logo
 * beside the greeting.
 *
 * Both values must be paths this app's own upload endpoint produced. The logo is
 * read back off disk and re-served as the app icon, so anything else here would
 * be either a broken icon or a file read outside the uploads directory.
 */
export async function updateBranding(form: FormData) {
  const actor = await requireAdminApi();

  const logo = str(form, "logo");
  const banner = str(form, "banner");
  if (logo && !isUploadedIconPath(logo)) return;
  if (banner && !isUploadedIconPath(banner)) return;

  const rawHeight = str(form, "bannerHeight");
  const bannerHeight = rawHeight === "sm" || rawHeight === "lg" ? rawHeight : "md";

  // Governs the header only. The favicon and app icon deliberately keep using
  // the logo whatever this says.
  const showLogoInHeader = form.get("showLogoInHeader") !== null;

  await setSettings({
    [SETTING_KEYS.portalLogo]: logo,
    [SETTING_KEYS.portalLogoInHeader]: showLogoInHeader ? "true" : "false",
    [SETTING_KEYS.portalBanner]: banner,
    [SETTING_KEYS.portalBannerHeight]: bannerHeight,
  });

  await recordAudit({
    actor,
    action: "update",
    entityType: "motd",
    summary: `Updated branding — logo ${logo ? "set" : "cleared"}${
      logo && !showLogoInHeader ? " (hidden in header)" : ""
    }, banner ${banner ? `set (${bannerHeight})` : "cleared"}`,
  });
  refresh();
}

/** Card layout, chosen independently for phones and wider screens. */
export async function setCardLayout(form: FormData) {
  const actor = await requireAdminApi();
  const mobile = str(form, "mobile") === "detailed" ? "detailed" : "compact";
  const desktop = str(form, "desktop") === "compact" ? "compact" : "detailed";

  await setSetting(SETTING_KEYS.serviceCardLayoutMobile, mobile);
  await setSetting(SETTING_KEYS.serviceCardLayoutDesktop, desktop);

  await recordAudit({
    actor,
    action: "update",
    entityType: "service",
    summary: `Set card layout to ${mobile} on mobile, ${desktop} on desktop`,
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

/** Renames a category and sets whether its section starts folded shut. */
export async function renameCategory(form: FormData) {
  const actor = await requireAdminApi();
  const id = str(form, "id");
  const name = str(form, "name");
  if (!id || !name) return;

  const startCollapsed = str(form, "startCollapsed") === "1";

  await db.update(categories).set({ name, startCollapsed }).where(eq(categories.id, id));
  await recordAudit({
    actor,
    action: "update",
    entityType: "category",
    entityId: id,
    summary: `Updated category "${name}" (starts ${startCollapsed ? "collapsed" : "expanded"})`,
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

const VALID_KINDS: ServiceKind[] = ["link", "popup", "page"];

/**
 * Resolves the URL/content pair for a service.
 *
 * A "link" card must have a safe URL. popup and page cards have no URL at all —
 * they carry markdown instead — so requiring one would block saving them.
 * Returns null when the submission is invalid and the save should be dropped.
 */
function resolveTarget(form: FormData): { kind: ServiceKind; url: string; content: string | null } | null {
  const rawKind = str(form, "kind") as ServiceKind;
  const kind = VALID_KINDS.includes(rawKind) ? rawKind : "link";

  if (kind === "link") {
    // Reject anything that isn't http(s) or a relative path — a javascript:
    // URL here would become stored XSS on every user's landing page.
    const url = safeUrlOrNull(str(form, "url"));
    if (!url) return null;
    return { kind, url, content: null };
  }

  return { kind, url: "", content: String(form.get("content") ?? "") };
}

export async function createService(form: FormData) {
  const actor = await requireAdminApi();
  const categoryId = str(form, "categoryId");
  const name = str(form, "name");
  const icon = optionalStr(form, "icon");
  const target = resolveTarget(form);
  if (!categoryId || !name || !target) return;
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
    kind: target.kind,
    url: target.url,
    content: target.content,
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
  const icon = optionalStr(form, "icon");
  const categoryId = str(form, "categoryId");
  const target = resolveTarget(form);
  if (!id || !name || !categoryId || !target) return;
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
      kind: target.kind,
      url: target.url,
      content: target.content,
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
