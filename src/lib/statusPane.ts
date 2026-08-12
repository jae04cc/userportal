import "server-only";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { statusItems, statusItemGroups } from "@/lib/db/schema";
import type { ServiceVisibility } from "@/lib/db/schema";
import { canSeeService, type VisibilityViewer } from "@/lib/visibility";

export type VisibleStatusItem = {
  id: string;
  label: string;
  /** Server-only — never serialised to the client, same rule as services. */
  monitorKey: string;
  visibility: ServiceVisibility;
};

/**
 * THE single source of truth for "which status tiles may this user see".
 *
 * Both the landing page and /api/status call this, for the same reason services
 * do: if the status endpoint built its own list, an admin-only tile would leak
 * through the payload.
 *
 * Reuses canSeeService — the visibility rules are identical, so they live in one
 * tested place rather than being reimplemented here.
 */
export async function getVisibleStatusItems(
  viewer: VisibilityViewer
): Promise<VisibleStatusItem[]> {
  const [items, itemGroups] = await Promise.all([
    db.select().from(statusItems).orderBy(asc(statusItems.sortOrder), asc(statusItems.label)),
    db.select().from(statusItemGroups),
  ]);

  const groupsByItem = new Map<string, string[]>();
  for (const g of itemGroups) {
    groupsByItem.set(g.statusItemId, [...(groupsByItem.get(g.statusItemId) ?? []), g.groupId]);
  }

  return items
    .filter((item) =>
      canSeeService(
        {
          visibility: item.visibility,
          isEnabled: item.isEnabled,
          allowedGroupIds: groupsByItem.get(item.id) ?? [],
        },
        viewer
      )
    )
    .map((item) => ({
      id: item.id,
      label: item.label,
      monitorKey: item.monitorKey,
      visibility: item.visibility,
    }));
}
