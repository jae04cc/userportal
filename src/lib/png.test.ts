import { describe, it, expect } from "vitest";
import { inflateSync } from "node:zlib";
import { Canvas, encodePng, hexToRgb, roundedRectDistance } from "./png";

/** Walks the chunk list of a PNG buffer. */
function readChunks(png: Buffer): Array<{ type: string; data: Buffer }> {
  const chunks: Array<{ type: string; data: Buffer }> = [];
  let offset = 8; // skip signature
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    chunks.push({ type, data: png.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
  }
  return chunks;
}

describe("encodePng", () => {
  it("writes the PNG signature", () => {
    const png = encodePng(new Uint8Array(4), 1, 1);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it("emits IHDR, IDAT and IEND in order", () => {
    const png = encodePng(new Uint8Array(4 * 4), 2, 2);
    expect(readChunks(png).map((c) => c.type)).toEqual(["IHDR", "IDAT", "IEND"]);
  });

  it("records the dimensions and colour type in IHDR", () => {
    const png = encodePng(new Uint8Array(3 * 5 * 4), 3, 5);
    const ihdr = readChunks(png).find((c) => c.type === "IHDR")!.data;
    expect(ihdr.readUInt32BE(0)).toBe(3);
    expect(ihdr.readUInt32BE(4)).toBe(5);
    expect(ihdr[8]).toBe(8); // 8-bit depth
    expect(ihdr[9]).toBe(6); // truecolour + alpha
  });

  it("round-trips pixel data through the IDAT stream", () => {
    // Two pixels: opaque red, then semi-transparent blue.
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 0, 255, 128]);
    const png = encodePng(rgba, 2, 1);
    const idat = readChunks(png).find((c) => c.type === "IDAT")!.data;
    const raw = inflateSync(idat);

    expect(raw[0]).toBe(0); // filter byte: None
    expect([...raw.subarray(1)]).toEqual([255, 0, 0, 255, 0, 0, 255, 128]);
  });

  it("prefixes every scanline with a filter byte", () => {
    const png = encodePng(new Uint8Array(2 * 3 * 4), 2, 3);
    const raw = inflateSync(readChunks(png).find((c) => c.type === "IDAT")!.data);
    // 3 rows x (1 filter byte + 2 px * 4 bytes)
    expect(raw.length).toBe(3 * (1 + 8));
    expect(raw[0]).toBe(0);
    expect(raw[9]).toBe(0);
    expect(raw[18]).toBe(0);
  });

  it("writes a CRC that matches each chunk", () => {
    // A wrong CRC is the classic silent corruption — decoders reject the file
    // with no clue why, so verify one directly.
    const png = encodePng(new Uint8Array(4), 1, 1);
    const length = png.readUInt32BE(8);
    const typeAndData = png.subarray(12, 12 + 4 + length);
    const stored = png.readUInt32BE(12 + 4 + length);

    let c = ~0;
    for (const byte of typeAndData) {
      c ^= byte;
      for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    expect(stored).toBe(~c >>> 0);
  });
});

describe("hexToRgb", () => {
  it("parses a six-digit hex colour", () => {
    expect(hexToRgb("#38bdf8")).toEqual({ r: 0x38, g: 0xbd, b: 0xf8 });
  });

  it("tolerates a missing hash", () => {
    expect(hexToRgb("0b0f14")).toEqual({ r: 11, g: 15, b: 20 });
  });
});

describe("roundedRectDistance", () => {
  it("is negative at the centre", () => {
    expect(roundedRectDistance(50, 50, 50, 50, 20, 20, 5)).toBeLessThan(0);
  });

  it("is about zero on the edge", () => {
    expect(Math.abs(roundedRectDistance(70, 50, 50, 50, 20, 20, 5))).toBeLessThan(0.001);
  });

  it("is positive outside", () => {
    expect(roundedRectDistance(90, 50, 50, 50, 20, 20, 5)).toBeGreaterThan(0);
  });

  it("rounds the corners — a corner point is outside a rounded shape", () => {
    // The exact corner of the bounding box lies outside once radius > 0,
    // which is what gives the icon its rounded look.
    const square = roundedRectDistance(70, 70, 50, 50, 20, 20, 0);
    const rounded = roundedRectDistance(70, 70, 50, 50, 20, 20, 8);
    expect(square).toBeCloseTo(0, 5);
    expect(rounded).toBeGreaterThan(0);
  });
});

describe("Canvas", () => {
  it("fills every pixel opaque", () => {
    const canvas = new Canvas(4, 4);
    canvas.fill({ r: 11, g: 15, b: 20 });
    expect([...canvas.data.subarray(0, 4)]).toEqual([11, 15, 20, 255]);
    expect(canvas.data.length).toBe(4 * 4 * 4);
    for (let i = 3; i < canvas.data.length; i += 4) expect(canvas.data[i]).toBe(255);
  });

  it("paints a rounded rect over the background", () => {
    const canvas = new Canvas(20, 20);
    canvas.fill({ r: 0, g: 0, b: 0 });
    canvas.roundedRect(10, 10, 6, 6, 2, { r: 255, g: 255, b: 255 });

    const centre = (10 * 20 + 10) * 4;
    expect(canvas.data[centre]).toBe(255);

    // A pixel well outside the shape is untouched.
    const corner = (0 * 20 + 0) * 4;
    expect(canvas.data[corner]).toBe(0);
  });

  it("blends with alpha rather than replacing", () => {
    const canvas = new Canvas(20, 20);
    canvas.fill({ r: 0, g: 0, b: 0 });
    canvas.roundedRect(10, 10, 6, 6, 2, { r: 255, g: 255, b: 255 }, 0.5);

    const centre = (10 * 20 + 10) * 4;
    expect(canvas.data[centre]).toBeGreaterThan(100);
    expect(canvas.data[centre]).toBeLessThan(160);
  });

  it("produces a decodable PNG of the right size", () => {
    const canvas = new Canvas(32, 32);
    canvas.fill({ r: 11, g: 15, b: 20 });
    canvas.roundedRect(16, 16, 8, 8, 3, { r: 56, g: 189, b: 248 });

    const png = canvas.toPng();
    const ihdr = readChunks(png).find((c) => c.type === "IHDR")!.data;
    expect(ihdr.readUInt32BE(0)).toBe(32);
    expect(ihdr.readUInt32BE(4)).toBe(32);
    expect(inflateSync(readChunks(png).find((c) => c.type === "IDAT")!.data).length).toBe(
      32 * (1 + 32 * 4)
    );
  });

  it("stays inside its bounds when the shape overflows the canvas", () => {
    const canvas = new Canvas(8, 8);
    canvas.fill({ r: 0, g: 0, b: 0 });
    expect(() => canvas.roundedRect(4, 4, 40, 40, 4, { r: 255, g: 0, b: 0 })).not.toThrow();
    expect(canvas.data.length).toBe(8 * 8 * 4);
  });
});
