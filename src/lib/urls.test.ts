import { describe, it, expect } from "vitest";
import { isSafeUrl, safeUrlOrNull, isSafeIcon } from "./urls";

describe("isSafeUrl", () => {
  it("accepts http and https", () => {
    expect(isSafeUrl("https://jellyfin.example.com")).toBe(true);
    expect(isSafeUrl("http://192.168.86.5:8096")).toBe(true);
  });

  it("accepts relative paths", () => {
    expect(isSafeUrl("/admin")).toBe(true);
    expect(isSafeUrl("/admin/services")).toBe(true);
  });

  it("rejects protocol-relative URLs, which can smuggle in another origin", () => {
    expect(isSafeUrl("//evil.example.com")).toBe(false);
  });

  it("rejects javascript: in every casing and with padding", () => {
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("JavaScript:alert(1)")).toBe(false);
    expect(isSafeUrl("  javascript:alert(1)  ")).toBe(false);
  });

  it("rejects data: and file: URLs", () => {
    expect(isSafeUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeUrl("file:///etc/passwd")).toBe(false);
  });

  it("rejects empty and malformed values", () => {
    expect(isSafeUrl("")).toBe(false);
    expect(isSafeUrl("   ")).toBe(false);
    expect(isSafeUrl("not a url")).toBe(false);
  });
});

describe("safeUrlOrNull", () => {
  it("returns the trimmed URL when safe", () => {
    expect(safeUrlOrNull("  https://example.com  ")).toBe("https://example.com");
  });

  it("returns null when unsafe, so the caller rejects the save", () => {
    expect(safeUrlOrNull("javascript:alert(1)")).toBeNull();
  });
});

describe("isSafeIcon", () => {
  it("accepts a bare lucide name", () => {
    expect(isSafeIcon("clapperboard")).toBe(true);
    expect(isSafeIcon("hard-drive")).toBe(true);
  });

  it("accepts an empty value, meaning no icon", () => {
    expect(isSafeIcon("")).toBe(true);
  });

  it("accepts an http(s) image URL", () => {
    expect(isSafeIcon("https://cdn.example.com/logo.png")).toBe(true);
  });

  it("accepts an uploaded icon path", () => {
    expect(isSafeIcon("/api/icons/abc123.png")).toBe(true);
  });

  it("rejects a javascript: icon value", () => {
    expect(isSafeIcon("javascript:alert(1)")).toBe(false);
  });
});
