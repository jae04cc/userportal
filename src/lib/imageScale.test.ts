import { describe, expect, it } from "vitest";
import {
  CHROME_MAX_ICON_PX,
  MAX_ICON_PX,
  describeRescale,
  fitWithin,
  needsRescale,
} from "@/lib/imageScale";

describe("fitWithin", () => {
  it("leaves anything already small enough completely alone", () => {
    expect(fitWithin({ width: 512, height: 512 }, 512)).toEqual({ width: 512, height: 512 });
    expect(fitWithin({ width: 100, height: 40 }, 512)).toEqual({ width: 100, height: 40 });
  });

  it("never upscales", () => {
    // Blowing a small logo up would only make it soft and heavier.
    expect(fitWithin({ width: 64, height: 64 }, 512)).toEqual({ width: 64, height: 64 });
  });

  it("scales a square down to the bound", () => {
    // The real case: 1340px is over Chrome's 1024 ceiling and costs the prompt.
    expect(fitWithin({ width: 1340, height: 1340 }, 512)).toEqual({ width: 512, height: 512 });
  });

  it("preserves aspect ratio rather than squaring the artwork", () => {
    expect(fitWithin({ width: 2000, height: 1000 }, 512)).toEqual({ width: 512, height: 256 });
    expect(fitWithin({ width: 1000, height: 2000 }, 512)).toEqual({ width: 256, height: 512 });
  });

  it("keeps an extreme aspect ratio from collapsing to zero", () => {
    // Rounding 1 * (512/4000) gives 0, which would be an invalid canvas.
    expect(fitWithin({ width: 4000, height: 1 }, 512)).toEqual({ width: 512, height: 1 });
  });

  it("stays under Chrome's installability ceiling at the default bound", () => {
    const scaled = fitWithin({ width: 4000, height: 4000 }, MAX_ICON_PX);
    expect(Math.max(scaled.width, scaled.height)).toBeLessThanOrEqual(CHROME_MAX_ICON_PX);
  });
});

describe("needsRescale", () => {
  it("passes through a PNG that is already small enough", () => {
    expect(needsRescale({ size: { width: 512, height: 512 }, type: "image/png" })).toBe(false);
    expect(needsRescale({ size: { width: 180, height: 90 }, type: "image/png" })).toBe(false);
  });

  it("rescales anything over the bound", () => {
    expect(needsRescale({ size: { width: 1340, height: 1340 }, type: "image/png" })).toBe(true);
    // Only the longest side matters.
    expect(needsRescale({ size: { width: 600, height: 100 }, type: "image/png" })).toBe(true);
  });

  it("converts non-PNG uploads, which the icon slots cannot use", () => {
    for (const type of ["image/jpeg", "image/webp", "image/gif", "image/svg+xml"]) {
      expect(needsRescale({ size: { width: 128, height: 128 }, type })).toBe(true);
    }
  });
});

describe("describeRescale", () => {
  it("says what actually happened", () => {
    expect(describeRescale({ width: 1340, height: 1340 }, { width: 512, height: 512 }, false)).toBe(
      "Resized from 1340×1340 to 512×512."
    );
    expect(describeRescale({ width: 1340, height: 1340 }, { width: 512, height: 512 }, true)).toBe(
      "Converted to PNG and resized from 1340×1340 to 512×512."
    );
    expect(describeRescale({ width: 256, height: 256 }, { width: 256, height: 256 }, true)).toBe(
      "Converted to PNG at 256×256."
    );
    expect(describeRescale({ width: 256, height: 256 }, { width: 256, height: 256 }, false)).toBe(
      "Stored as uploaded, 256×256."
    );
  });
});
