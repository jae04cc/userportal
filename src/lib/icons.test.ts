import { describe, it, expect } from "vitest";
import { isImageIcon } from "./icons";

describe("isImageIcon", () => {
  it("recognises an uploaded icon path", () => {
    // The regression this exists for: uploaded icons are site-relative, and a
    // check for http(s):// alone silently rendered them as the lucide fallback.
    expect(isImageIcon("/api/icons/kY8vDbmnbTMqxDGBO7q9nw.png")).toBe(true);
  });

  it("recognises absolute image URLs", () => {
    expect(isImageIcon("https://cdn.example.com/plex.svg")).toBe(true);
    expect(isImageIcon("http://192.168.86.5/logo.png")).toBe(true);
  });

  it("tolerates surrounding whitespace", () => {
    expect(isImageIcon("  /api/icons/a.png  ")).toBe(true);
  });

  it("treats a bare lucide name as not an image", () => {
    expect(isImageIcon("settings")).toBe(false);
    expect(isImageIcon("hard-drive")).toBe(false);
    expect(isImageIcon("clapperboard")).toBe(false);
  });

  it("treats empty or missing values as not an image", () => {
    expect(isImageIcon(null)).toBe(false);
    expect(isImageIcon(undefined)).toBe(false);
    expect(isImageIcon("")).toBe(false);
    expect(isImageIcon("   ")).toBe(false);
  });

  it("rejects protocol-relative URLs, which point at another origin", () => {
    expect(isImageIcon("//evil.example.com/x.png")).toBe(false);
  });

  it("rejects javascript: and data: values", () => {
    expect(isImageIcon("javascript:alert(1)")).toBe(false);
    expect(isImageIcon("data:image/svg+xml,<svg/>")).toBe(false);
  });
});
