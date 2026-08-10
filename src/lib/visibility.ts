import type { ServiceVisibility } from "@/lib/db/schema";

export type VisibilityInput = {
  visibility: ServiceVisibility;
  isEnabled: boolean;
  /** Group ids allowed to see this service; only consulted when visibility === "groups". */
  allowedGroupIds: string[];
};

export type VisibilityViewer = {
  isAdmin: boolean;
  groupIds: string[];
};

/**
 * Pure authorization decision, deliberately free of any DB access so it can be
 * exhaustively unit tested. This is the only place the visibility rules live.
 *
 * Admins see everything, including services disabled or scoped to groups they
 * aren't a member of — per the spec's "an admin sees everything".
 */
export function canSeeService(service: VisibilityInput, viewer: VisibilityViewer): boolean {
  if (viewer.isAdmin) return true;
  if (!service.isEnabled) return false;

  switch (service.visibility) {
    case "all":
      return true;
    case "admin":
      return false;
    case "groups":
      return service.allowedGroupIds.some((id) => viewer.groupIds.includes(id));
    default:
      // Unknown value in the DB is treated as private rather than public —
      // failing closed is the only safe default for an authorization check.
      return false;
  }
}
