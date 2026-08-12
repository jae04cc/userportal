import { describe, it, expect } from "vitest";
import { isImageIcon, isUploadedIconPath, uploadFileName } from "./icons";

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

describe("isUploadedIconPath", () => {
  it("accepts the exact shape saveIconUpload returns", () => {
    expect(isUploadedIconPath("/api/icons/kY8vDbmnbTMqxDGBO7q9nw.png")).toBe(true);
    expect(isUploadedIconPath("/api/icons/abc_DEF-123.svg")).toBe(true);
    expect(isUploadedIconPath("  /api/icons/a.webp  ")).toBe(true);
  });

  it("rejects anything that isn't a file this app wrote", () => {
    // Branding artwork is read back off disk to be re-served as the app icon,
    // so a remote URL could not be used there even if it rendered in the header.
    expect(isUploadedIconPath("https://cdn.example.com/logo.png")).toBe(false);
    expect(isUploadedIconPath("/uploads/logo.png")).toBe(false);
    expect(isUploadedIconPath("settings")).toBe(false);
    expect(isUploadedIconPath("")).toBe(false);
    expect(isUploadedIconPath(null)).toBe(false);
  });

  it("rejects names that could walk out of the uploads directory", () => {
    expect(isUploadedIconPath("/api/icons/../../etc/passwd")).toBe(false);
    expect(isUploadedIconPath("/api/icons/..%2F..%2Fsecret.png")).toBe(false);
    expect(isUploadedIconPath("/api/icons/sub/dir/logo.png")).toBe(false);
    // No extension — readIcon has no content type for it anyway.
    expect(isUploadedIconPath("/api/icons/logo")).toBe(false);
  });
});

describe("uploadFileName", () => {
  it("returns the bare file name", () => {
    expect(uploadFileName("/api/icons/abc123.png")).toBe("abc123.png");
    expect(uploadFileName("  /api/icons/abc123.png  ")).toBe("abc123.png");
  });

  it("returns null for anything it wouldn't accept as a path", () => {
    expect(uploadFileName("https://example.com/x.png")).toBe(null);
    expect(uploadFileName("/api/icons/../x.png")).toBe(null);
    expect(uploadFileName(null)).toBe(null);
  });
});
