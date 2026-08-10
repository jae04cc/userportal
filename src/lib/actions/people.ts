"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { groups, userGroups, users } from "@/lib/db/schema";
import { requireAdminApi } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import { generateId } from "@/lib/utils";
import { hashPassword } from "@/lib/password";
import { SETTING_KEYS, setSetting } from "@/lib/settings";

function refresh() {
  revalidatePath("/");
  revalidatePath("/admin", "layout");
}

function str(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

// ---------------------------------------------------------------------------
// Groups (access groups, not display categories)
// ---------------------------------------------------------------------------

export async function createGroup(form: FormData) {
  const actor = await requireAdminApi();
  const name = str(form, "name");
  if (!name) return;

  const [{ max }] = await db
    .select({ max: sql<number>`COALESCE(MAX(${groups.sortOrder}), -1)` })
    .from(groups);

  const id = generateId();
  await db.insert(groups).values({
    id,
    name,
    description: str(form, "description") || null,
    sortOrder: max + 1,
    createdAt: new Date(),
  });

  await recordAudit({
    actor,
    action: "create",
    entityType: "group",
    entityId: id,
    summary: `Created group "${name}"`,
  });
  refresh();
}

export async function updateGroup(form: FormData) {
  const actor = await requireAdminApi();
  const id = str(form, "id");
  const name = str(form, "name");
  if (!id || !name) return;

  await db
    .update(groups)
    .set({ name, description: str(form, "description") || null })
    .where(eq(groups.id, id));

  await recordAudit({
    actor,
    action: "update",
    entityType: "group",
    entityId: id,
    summary: `Updated group "${name}"`,
  });
  refresh();
}

export async function deleteGroup(form: FormData) {
  const actor = await requireAdminApi();
  const id = str(form, "id");
  if (!id) return;

  const existing = await db.query.groups.findFirst({ where: eq(groups.id, id) });
  if (!existing) return;

  // Memberships and service scopings cascade away with the group. Any service
  // still set to "groups" visibility with no groups left resolves to invisible
  // for non-admins, which is the safe direction to fail.
  await db.delete(groups).where(eq(groups.id, id));

  await recordAudit({
    actor,
    action: "delete",
    entityType: "group",
    entityId: id,
    summary: `Deleted group "${existing.name}"`,
  });
  refresh();
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function createUser(form: FormData) {
  const actor = await requireAdminApi();
  const username = str(form, "username").toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!username) return;

  const clash = await db.query.users.findFirst({ where: eq(users.username, username) });
  if (clash) return;

  const id = generateId();
  await db.insert(users).values({
    id,
    username,
    // No password means the account can only sign in via SSO.
    passwordHash: password ? await hashPassword(password) : null,
    displayName: str(form, "displayName") || username,
    email: str(form, "email") || null,
    isAdmin: form.get("isAdmin") !== null,
    isBootstrap: false,
    createdAt: new Date(),
  });

  await recordAudit({
    actor,
    action: "create",
    entityType: "user",
    entityId: id,
    summary: `Created user "${username}"`,
  });
  refresh();
}

export async function updateUser(form: FormData) {
  const actor = await requireAdminApi();
  const id = str(form, "id");
  if (!id) return;

  const target = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!target) return;

  const wantsAdmin = form.get("isAdmin") !== null;
  const wantsActive = form.get("isActive") !== null;

  // Guard against locking everyone out of the admin area: refuse to demote or
  // suspend the last remaining admin, and refuse to let an admin do either to
  // themselves.
  const losingAdminAccess = (target.isAdmin && !wantsAdmin) || (target.isAdmin && !wantsActive);
  if (losingAdminAccess) {
    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(users)
      .where(and(eq(users.isAdmin, true), eq(users.isActive, true)));
    if (Number(count) <= 1 || target.id === actor.id) return;
  }

  const newPassword = String(form.get("password") ?? "");

  await db
    .update(users)
    .set({
      displayName: str(form, "displayName") || target.username,
      email: str(form, "email") || null,
      // Deliberate admin action to link an existing local account to an SSO
      // identity. Never inferred from a matching email address.
      oidcSub: str(form, "oidcSub") || null,
      isAdmin: wantsAdmin,
      isActive: form.get("isActive") !== null,
      ...(newPassword ? { passwordHash: await hashPassword(newPassword) } : {}),
    })
    .where(eq(users.id, id));

  await recordAudit({
    actor,
    action: "update",
    entityType: "user",
    entityId: id,
    summary:
      `Updated user "${target.username}"` +
      (newPassword ? " (password reset)" : "") +
      (target.isAdmin !== wantsAdmin ? (wantsAdmin ? " (promoted to admin)" : " (demoted)") : ""),
  });
  refresh();
}

export async function deleteUser(form: FormData) {
  const actor = await requireAdminApi();
  const id = str(form, "id");
  if (!id || id === actor.id) return;

  const target = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!target) return;

  if (target.isAdmin) {
    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(users)
      .where(eq(users.isAdmin, true));
    if (Number(count) <= 1) return;
  }

  await db.delete(users).where(eq(users.id, id));
  await recordAudit({
    actor,
    action: "delete",
    entityType: "user",
    entityId: id,
    summary: `Deleted user "${target.username}"`,
  });
  refresh();
}

/**
 * Sets which group brand-new SSO users are placed in. Without one they land on
 * a near-empty portal, seeing only "everyone" services.
 */
export async function setDefaultGroup(form: FormData) {
  const actor = await requireAdminApi();
  const groupId = str(form, "groupId");

  if (!groupId) {
    await setSetting(SETTING_KEYS.defaultGroupId, "");
    await recordAudit({
      actor,
      action: "update",
      entityType: "group",
      summary: "Cleared the default group for new SSO users",
    });
    refresh();
    return;
  }

  const group = await db.query.groups.findFirst({ where: eq(groups.id, groupId) });
  if (!group) return;

  await setSetting(SETTING_KEYS.defaultGroupId, groupId);
  await recordAudit({
    actor,
    action: "update",
    entityType: "group",
    entityId: groupId,
    summary: `Set "${group.name}" as the default group for new SSO users`,
  });
  refresh();
}

/** Replaces a user's entire group membership with the submitted checkbox set. */
export async function setUserGroups(form: FormData) {
  const actor = await requireAdminApi();
  const userId = str(form, "userId");
  if (!userId) return;

  const target = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!target) return;

  const groupIds = form.getAll("groupIds").map(String).filter(Boolean);

  await db.delete(userGroups).where(eq(userGroups.userId, userId));
  if (groupIds.length > 0) {
    await db.insert(userGroups).values(groupIds.map((groupId) => ({ userId, groupId })));
  }

  const names =
    groupIds.length > 0
      ? (await db.select().from(groups).orderBy(asc(groups.name)))
          .filter((g) => groupIds.includes(g.id))
          .map((g) => g.name)
          .join(", ")
      : "none";

  await recordAudit({
    actor,
    action: "update",
    entityType: "membership",
    entityId: userId,
    summary: `Set groups for "${target.username}" to: ${names}`,
  });
  refresh();
}
