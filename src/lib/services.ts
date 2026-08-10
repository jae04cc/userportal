import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, services, serviceGroups, appSettings } from "@/lib/db/schema";
import type { ServiceVisibility } from "@/lib/db/schema";
import { canSeeService } from "@/lib/visibility";
import type { CurrentUser } from "@/lib/authz";

export type VisibleService = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  url: string;
  /** Server-only. Never serialised to the client — see /api/status. */
  monitorKey: string | null;
  visibility: ServiceVisibility;
  isEnabled: boolean;
};

export type VisibleCategory = {
  id: string;
  name: string;
  services: VisibleService[];
};

/**
 * THE single source of truth for "which services may this user see".
 *
 * Both the landing page and /api/status call this. That is load-bearing: if the
 * status endpoint built its own list, it would leak the existence of admin-only
 * services to normal users through their status payload.
 */
export async function getVisibleServices(user: CurrentUser): Promise<VisibleCategory[]> {
  const [allCategories, allServices, allServiceGroups] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name)),
    db.select().from(services).orderBy(asc(services.sortOrder), asc(services.name)),
    db.select().from(serviceGroups),
  ]);

  const groupsByService = new Map<string, string[]>();
  for (const sg of allServiceGroups) {
    const list = groupsByService.get(sg.serviceId) ?? [];
    list.push(sg.groupId);
    groupsByService.set(sg.serviceId, list);
  }

  const viewer = { isAdmin: user.isAdmin, groupIds: user.groupIds };

  const result: VisibleCategory[] = [];
  for (const category of allCategories) {
    const visible = allServices
      .filter((s) => s.categoryId === category.id)
      .filter((s) =>
        canSeeService(
          {
            visibility: s.visibility,
            isEnabled: s.isEnabled,
            allowedGroupIds: groupsByService.get(s.id) ?? [],
          },
          viewer
        )
      )
      .map(
        (s): VisibleService => ({
          id: s.id,
          name: s.name,
          description: s.description,
          icon: s.icon,
          url: s.url,
          monitorKey: s.monitorKey,
          visibility: s.visibility,
          isEnabled: s.isEnabled,
        })
      );

    // An empty category is noise on the landing page — drop it.
    if (visible.length > 0) {
      result.push({ id: category.id, name: category.name, services: visible });
    }
  }

  return result;
}

export async function getMotd(): Promise<string> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, "motd") });
  return row?.value ?? "";
}

export async function setMotd(value: string) {
  await db
    .insert(appSettings)
    .values({ key: "motd", value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
}
