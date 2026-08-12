import { describe, it, expect } from "vitest";
import { COLLAPSE_AFTER_OPTIONS, DEFAULT_COLLAPSE_AFTER, parseCollapseAfter } from "./paneLayout";

describe("parseCollapseAfter", () => {
  it("falls back to the default when the setting has never been saved", () => {
    // The regression this exists for. Number(null) and Number("") are both 0,
    // and 0 is a VALID option here meaning "never collapse" — so parsing before
    // the empty check silently turned collapsing off for every install where an
    // admin had not opened the status pane settings.
    expect(parseCollapseAfter(null)).toBe(DEFAULT_COLLAPSE_AFTER);
    expect(parseCollapseAfter(undefined)).toBe(DEFAULT_COLLAPSE_AFTER);
    expect(parseCollapseAfter("")).toBe(DEFAULT_COLLAPSE_AFTER);
    expect(parseCollapseAfter("   ")).toBe(DEFAULT_COLLAPSE_AFTER);
  });

  it("honours an explicit 0 as 'never collapse'", () => {
    // Distinct from "unset" — an admin who chooses this must get it.
    expect(parseCollapseAfter("0")).toBe(0);
  });

  it("accepts every offered option", () => {
    for (const n of COLLAPSE_AFTER_OPTIONS) {
      expect(parseCollapseAfter(String(n))).toBe(n);
    }
  });

  it("rejects values that aren't on the menu", () => {
    expect(parseCollapseAfter("5")).toBe(DEFAULT_COLLAPSE_AFTER);
    expect(parseCollapseAfter("-1")).toBe(DEFAULT_COLLAPSE_AFTER);
    expect(parseCollapseAfter("999")).toBe(DEFAULT_COLLAPSE_AFTER);
    expect(parseCollapseAfter("2.5")).toBe(DEFAULT_COLLAPSE_AFTER);
    expect(parseCollapseAfter("four")).toBe(DEFAULT_COLLAPSE_AFTER);
    expect(parseCollapseAfter("NaN")).toBe(DEFAULT_COLLAPSE_AFTER);
  });
});
