import { describe, it, expect } from "vitest";
import {
  extractGroups,
  isAdminFromGroups,
  resolveGroupNames,
  resolveDisplayName,
  resolveUsername,
} from "./idpSync";

describe("extractGroups", () => {
  it("reads a normal array claim", () => {
    expect(extractGroups({ groups: ["Media", "Admins"] }, "groups")).toEqual(["Media", "Admins"]);
  });

  it("reads a single string as one group", () => {
    expect(extractGroups({ groups: "Media" }, "groups")).toEqual(["Media"]);
  });

  it("splits a space or comma delimited string", () => {
    expect(extractGroups({ groups: "Media, Admins" }, "groups")).toEqual(["Media", "Admins"]);
    expect(extractGroups({ groups: "Media Admins" }, "groups")).toEqual(["Media", "Admins"]);
  });

  it("honours a non-default claim name", () => {
    expect(extractGroups({ roles: ["A"], groups: ["B"] }, "roles")).toEqual(["A"]);
  });

  it("drops blanks and non-strings", () => {
    expect(extractGroups({ groups: ["A", "", null, 42, "B"] as unknown[] }, "groups")).toEqual([
      "A",
      "B",
    ]);
  });

  it("de-duplicates", () => {
    expect(extractGroups({ groups: ["A", "A", " A "] }, "groups")).toEqual(["A"]);
  });

  it("returns nothing when the claim is missing, empty, or the wrong shape", () => {
    expect(extractGroups({}, "groups")).toEqual([]);
    expect(extractGroups({ groups: [] }, "groups")).toEqual([]);
    expect(extractGroups({ groups: "   " }, "groups")).toEqual([]);
    expect(extractGroups({ groups: { a: 1 } }, "groups")).toEqual([]);
    expect(extractGroups({ groups: null }, "groups")).toEqual([]);
  });
});

describe("isAdminFromGroups", () => {
  it("grants admin on an exact match", () => {
    expect(isAdminFromGroups(["Media", "Portal Admins"], "Portal Admins")).toBe(true);
  });

  it("matches case-insensitively and ignores surrounding space", () => {
    expect(isAdminFromGroups(["portal admins"], "Portal Admins")).toBe(true);
    expect(isAdminFromGroups([" Portal Admins "], "portal admins")).toBe(true);
  });

  it("denies when the user isn't in the group", () => {
    expect(isAdminFromGroups(["Media"], "Portal Admins")).toBe(false);
  });

  it("denies everyone when no admin group is configured — fails closed", () => {
    expect(isAdminFromGroups(["Portal Admins"], "")).toBe(false);
    expect(isAdminFromGroups(["Portal Admins"], "   ")).toBe(false);
  });

  it("denies when the user has no groups at all", () => {
    expect(isAdminFromGroups([], "Portal Admins")).toBe(false);
  });

  it("does not match on a partial or substring name", () => {
    expect(isAdminFromGroups(["Portal Admins Deputies"], "Portal Admins")).toBe(false);
    expect(isAdminFromGroups(["Admins"], "Portal Admins")).toBe(false);
  });
});

describe("resolveGroupNames", () => {
  it("uses the claim's groups when present", () => {
    expect(resolveGroupNames(["Media"], "Everyone")).toEqual(["Media"]);
  });

  it("does NOT add the default group alongside claimed groups", () => {
    // The IdP is the sole source of truth. Adding a default on top would be
    // silently re-applied on every login and contradict Authentik.
    expect(resolveGroupNames(["Media"], "Everyone")).not.toContain("Everyone");
  });

  it("falls back to the default group only when the claim is empty", () => {
    expect(resolveGroupNames([], "Everyone")).toEqual(["Everyone"]);
  });

  it("yields nothing when the claim is empty and no default is set", () => {
    expect(resolveGroupNames([], null)).toEqual([]);
    expect(resolveGroupNames([], "  ")).toEqual([]);
  });
});

describe("resolveDisplayName", () => {
  it("prefers name", () => {
    expect(resolveDisplayName({ name: "Ada", preferred_username: "ada" }, "x")).toBe("Ada");
  });

  it("falls through to preferred_username, then email", () => {
    expect(resolveDisplayName({ preferred_username: "ada" }, "x")).toBe("ada");
    expect(resolveDisplayName({ email: "ada@example.com" }, "x")).toBe("ada@example.com");
  });

  it("uses the fallback when nothing usable is present", () => {
    expect(resolveDisplayName({}, "fallback")).toBe("fallback");
    expect(resolveDisplayName({ name: "   " }, "fallback")).toBe("fallback");
  });
});

describe("resolveUsername", () => {
  it("prefers preferred_username, lowercased", () => {
    expect(resolveUsername({ preferred_username: "Ada.Lovelace" }, "x")).toBe("ada.lovelace");
  });

  it("replaces whitespace with hyphens", () => {
    expect(resolveUsername({ preferred_username: "Ada Lovelace" }, "x")).toBe("ada-lovelace");
  });

  it("falls back to the subject when no usable claim exists", () => {
    expect(resolveUsername({}, "sub-123")).toBe("sub-123");
  });
});
