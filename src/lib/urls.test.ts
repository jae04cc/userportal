import { describe, it, expect } from "vitest";
import { isSafeUrl, safeUrlOrNull, isSafeIcon, normalizePublicOrigin } from "./urls";

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

describe("normalizePublicOrigin", () => {
  it("reduces a URL to its bare origin", () => {
    expect(normalizePublicOrigin("https://devportal.murky.media")).toBe(
      "https://devportal.murky.media"
    );
    expect(normalizePublicOrigin("  https://devportal.murky.media/  ")).toBe(
      "https://devportal.murky.media"
    );
    expect(normalizePublicOrigin("http://192.168.86.16:5175")).toBe("http://192.168.86.16:5175");
  });

  it("strips any path, query or fragment", () => {
    // Auth.js reads a non-root pathname as a basePath and moves every auth
    // route, so a pasted URL with a trailing path must not survive.
    expect(normalizePublicOrigin("https://portal.example.com/login")).toBe(
      "https://portal.example.com"
    );
    expect(normalizePublicOrigin("https://portal.example.com/?a=1#x")).toBe(
      "https://portal.example.com"
    );
  });

  it("normalises default ports", () => {
    expect(normalizePublicOrigin("https://portal.example.com:443")).toBe(
      "https://portal.example.com"
    );
  });

  it("returns null for anything unusable", () => {
    expect(normalizePublicOrigin("")).toBe(null);
    expect(normalizePublicOrigin("   ")).toBe(null);
    expect(normalizePublicOrigin(null)).toBe(null);
    expect(normalizePublicOrigin("devportal.murky.media")).toBe(null); // no scheme
    expect(normalizePublicOrigin("javascript:alert(1)")).toBe(null);
    expect(normalizePublicOrigin("ftp://example.com")).toBe(null);
  });
});
