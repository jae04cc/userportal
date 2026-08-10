"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { groups, userGroups, users } from "@/lib/db/schema";
import { requireAdminApi } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import { generateId } from "@/lib/utils";

/**
 * Users are provisioned by the identity provider on first sign-in, and their
 * group membership and admin rights are mirrored from token claims. So there is
 * deliberately no "create user", no password field, and no membership editing
 * here — only the levers the portal genuinely owns: suspend and delete.
 */

function refresh() {
  revalidatePath("/");
  revalidatePath("/admin", "layout");
}

function str(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

// ---------------------------------------------------------------------------
// Groups
//
// Membership comes from the IdP, but the group RECORD is still managed here:
// creating one by name lets a service be scoped to it before anyone in that
// group has ever signed in. The name must match the IdP's group name.
// ---------------------------------------------------------------------------

export async function createGroup(form: FormData) {
  const actor = await requireAdminApi();
  const name = str(form, "name");
  if (!name) return;

  const clash = await db.query.groups.findFirst({ where: eq(groups.name, name) });
  if (clash) return;

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

  // Memberships and service scopings cascade away. A service still set to
  // "groups" visibility with no groups left resolves to invisible for
  // non-admins, which is the safe direction to fail. Note the group will
  // reappear if the IdP still sends its name on a later sign-in.
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

/** Suspend or reactivate. Suspension takes effect on the user's next request. */
export async function setUserActive(form: FormData) {
  const actor = await requireAdminApi();
  const id = str(form, "id");
  const active = str(form, "active") === "true";
  if (!id) return;

  const target = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!target) return;

  // Never let the last active admin — or yourself — be suspended.
  if (!active && target.isAdmin) {
    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(users)
      .where(and(eq(users.isAdmin, true), eq(users.isActive, true)));
    if (Number(count) <= 1 || target.id === actor.id) return;
  }

  await db.update(users).set({ isActive: active }).where(eq(users.id, id));

  await recordAudit({
    actor,
    action: "update",
    entityType: "user",
    entityId: id,
    summary: `${active ? "Reactivated" : "Suspended"} user "${target.username}"`,
  });
  refresh();
}

/**
 * Sets the groups an admin grants directly in the portal.
 *
 * Only touches `source = 'portal'` rows — memberships that came from the
 * identity provider are left alone, because the next sign-in would just
 * reinstate them and pretending otherwise would be misleading.
 */
export async function setUserPortalGroups(form: FormData) {
  const actor = await requireAdminApi();
  const userId = str(form, "userId");
  if (!userId) return;

  const target = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!target) return;

  const groupIds = form.getAll("groupIds").map(String).filter(Boolean);

  await db
    .delete(userGroups)
    .where(and(eq(userGroups.userId, userId), eq(userGroups.source, "portal")));

  if (groupIds.length > 0) {
    await db
      .insert(userGroups)
      .values(groupIds.map((groupId) => ({ userId, groupId, source: "portal" as const })))
      // A group the IdP also grants is upgraded to a portal assignment, so it
      // stops depending on the claim still being sent.
      .onConflictDoUpdate({
        target: [userGroups.userId, userGroups.groupId],
        set: { source: "portal" },
      });
  }

  const names =
    groupIds.length > 0
      ? (await db.select().from(groups))
          .filter((g) => groupIds.includes(g.id))
          .map((g) => g.name)
          .join(", ")
      : "none";

  await recordAudit({
    actor,
    action: "update",
    entityType: "membership",
    entityId: userId,
    summary: `Set portal groups for "${target.username}" to: ${names}`,
  });
  refresh();
}

export async function deleteUser(form: FormData) {
  const actor = await requireAdminApi();
  const id = str(form, "id");
  if (!id || id === actor.id) return;

  const target = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!target) return;

  // The bootstrap account is the way back in if the IdP breaks — never delete it.
  if (target.isBootstrap) return;

  if (target.isAdmin) {
    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(users)
      .where(and(eq(users.isAdmin, true), eq(users.isActive, true)));
    if (Number(count) <= 1) return;
  }

  await db.delete(users).where(eq(users.id, id));
  await recordAudit({
    actor,
    action: "delete",
    entityType: "user",
    entityId: id,
    summary: `Deleted user "${target.username}" (will be recreated if they sign in again)`,
  });
  refresh();
}
