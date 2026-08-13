import { describe, expect, it } from "vitest";
import { resolveIdentity, SURFACE_BASE } from "@/lib/identity";

/**
 * These values are written into generated files — the web manifest and the PNG
 * icon — rather than validated at the point of use, so a bad one is baked in
 * and served rather than rejected.
 */
describe("resolveIdentity", () => {
  it("falls back to the defaults for an unconfigured portal", () => {
    const identity = resolveIdentity({});
    expect(identity.name).toBe("Portal");
    expect(identity.accent).toBe("#38bdf8");
    expect(identity.themeSource).toBe("surface");
    expect(identity.themeColor).toBe(SURFACE_BASE);
  });

  it("defaults the window colour to the app background, not the accent", () => {
    // The regression this file exists for: a red accent used to paint the
    // installed app's title bar red on Windows.
    const identity = resolveIdentity({ accent: "#f87171" });
    expect(identity.accent).toBe("#f87171");
    expect(identity.themeColor).toBe(SURFACE_BASE);
  });

  it("uses the accent for the window colour only when explicitly opted in", () => {
    const identity = resolveIdentity({
      accent: "#f87171",
      themeSource: "accent",
    });
    expect(identity.themeSource).toBe("accent");
    expect(identity.themeColor).toBe("#f87171");
  });

  it("treats an unrecognised theme source as the app background", () => {
    const identity = resolveIdentity({ themeSource: "rainbow" });
    expect(identity.themeSource).toBe("surface");
    expect(identity.themeColor).toBe(SURFACE_BASE);
  });

  it("rejects a non-hex accent rather than interpolating it", () => {
    for (const bad of ["red", "#fff", "#12345g", "javascript:alert(1)", "#38bdf8; }"]) {
      expect(resolveIdentity({ accent: bad }).accent).toBe("#38bdf8");
    }
  });

  it("a rejected accent cannot leak through the window colour either", () => {
    const identity = resolveIdentity({
      accent: "#38bdf8; }",
      themeSource: "accent",
    });
    expect(identity.themeColor).toBe("#38bdf8");
  });

  it("trims and falls back on a blank name", () => {
    expect(resolveIdentity({ name: "   " }).name).toBe("Portal");
    expect(resolveIdentity({ name: "  Dev Portal  " }).name).toBe("Dev Portal");
  });
});
