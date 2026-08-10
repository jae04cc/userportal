import { describe, it, expect } from "vitest";
import { canSeeService, type VisibilityInput, type VisibilityViewer } from "./visibility";

const admin: VisibilityViewer = { isAdmin: true, groupIds: [] };
const member: VisibilityViewer = { isAdmin: false, groupIds: ["g-media"] };
const outsider: VisibilityViewer = { isAdmin: false, groupIds: ["g-other"] };
const groupless: VisibilityViewer = { isAdmin: false, groupIds: [] };

function service(overrides: Partial<VisibilityInput> = {}): VisibilityInput {
  return { visibility: "all", isEnabled: true, allowedGroupIds: [], ...overrides };
}

describe("canSeeService", () => {
  describe('visibility "all"', () => {
    it("is visible to any signed-in user", () => {
      expect(canSeeService(service(), groupless)).toBe(true);
      expect(canSeeService(service(), member)).toBe(true);
      expect(canSeeService(service(), admin)).toBe(true);
    });
  });

  describe('visibility "admin"', () => {
    it("is visible to admins only", () => {
      expect(canSeeService(service({ visibility: "admin" }), admin)).toBe(true);
      expect(canSeeService(service({ visibility: "admin" }), member)).toBe(false);
      expect(canSeeService(service({ visibility: "admin" }), groupless)).toBe(false);
    });
  });

  describe('visibility "groups"', () => {
    const scoped = service({ visibility: "groups", allowedGroupIds: ["g-media"] });

    it("is visible to a member of an allowed group", () => {
      expect(canSeeService(scoped, member)).toBe(true);
    });

    it("is hidden from a user in a different group", () => {
      expect(canSeeService(scoped, outsider)).toBe(false);
    });

    it("is hidden from a user with no groups", () => {
      expect(canSeeService(scoped, groupless)).toBe(false);
    });

    it("is hidden from everyone when no groups are assigned", () => {
      const orphaned = service({ visibility: "groups", allowedGroupIds: [] });
      expect(canSeeService(orphaned, member)).toBe(false);
      expect(canSeeService(orphaned, groupless)).toBe(false);
    });

    it("matches when the user is in any one of several allowed groups", () => {
      const multi = service({ visibility: "groups", allowedGroupIds: ["g-a", "g-media", "g-b"] });
      expect(canSeeService(multi, member)).toBe(true);
    });
  });

  describe("disabled services", () => {
    it("are hidden from normal users regardless of visibility", () => {
      expect(canSeeService(service({ isEnabled: false }), member)).toBe(false);
      expect(
        canSeeService(
          service({ visibility: "groups", allowedGroupIds: ["g-media"], isEnabled: false }),
          member
        )
      ).toBe(false);
    });

    it("remain visible to admins, so they can find and re-enable them", () => {
      expect(canSeeService(service({ isEnabled: false }), admin)).toBe(true);
    });
  });

  describe("admins", () => {
    it("see group-scoped services without being a member", () => {
      expect(
        canSeeService(service({ visibility: "groups", allowedGroupIds: ["g-nobody"] }), admin)
      ).toBe(true);
    });
  });

  describe("unknown visibility values", () => {
    it("fail closed for non-admins", () => {
      const bogus = service({ visibility: "totally-invalid" as never });
      expect(canSeeService(bogus, member)).toBe(false);
      expect(canSeeService(bogus, groupless)).toBe(false);
    });
  });
});
