import { deflateSync } from "node:zlib";

/**
 * Minimal RGBA → PNG encoder.
 *
 * Exists because `next/og` cannot run on Windows in this Next version: the
 * bundled @vercel/og resolves its font with a malformed `.\file:\C:\…` path at
 * MODULE LOAD time and throws ERR_INVALID_URL, so supplying fonts explicitly
 * doesn't help either. Adding a native rasteriser (sharp, resvg) for four flat
 * shapes would be a heavy dependency for the job.
 *
 * node:zlib does the only hard part. Everything here is flat colour, so a
 * truecolour-with-alpha PNG is a handful of chunks.
 */

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

/** `rgba` must be width * height * 4 bytes, row-major, non-premultiplied. */
export function encodePng(rgba: Uint8Array, width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour with alpha
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // Each scanline is prefixed with its filter type; 0 (None) keeps this simple
  // and still compresses well for large flat areas.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1
    );
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Reads width and height out of a PNG's IHDR chunk, which is always first and
 * always at a fixed offset.
 *
 * The manifest has to declare each icon's `sizes`, and a wrong value is worse
 * than none — Chrome picks an icon by its declared size and will happily choose
 * one that turns out to be 32px. So an uploaded logo is measured rather than
 * assumed. Returns null for anything that isn't a PNG, which is also how the
 * caller decides an upload can't be used in a PNG-only icon slot.
 */
export function parsePngSize(buf: Buffer): { width: number; height: number } | null {
  // 8 signature + 4 length + 4 "IHDR" + 8 dimensions.
  if (buf.length < 24) return null;
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (buf.subarray(12, 16).toString("ascii") !== "IHDR") return null;

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width === 0 || height === 0) return null;

  return { width, height };
}

export type Rgb = { r: number; g: number; b: number };

export function hexToRgb(hex: string): Rgb {
  const v = hex.replace("#", "");
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  };
}

/**
 * Signed distance from a point to a rounded rectangle: negative inside,
 * positive outside. Used for anti-aliasing — coverage comes from how far the
 * pixel centre sits from the edge, which is cheaper and cleaner than
 * supersampling.
 */
export function roundedRectDistance(
  px: number,
  py: number,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  radius: number
): number {
  const dx = Math.abs(px - cx) - (halfW - radius);
  const dy = Math.abs(py - cy) - (halfH - radius);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  const inside = Math.min(Math.max(dx, dy), 0);
  return outside + inside - radius;
}

/** Simple RGBA canvas with source-over compositing. */
export class Canvas {
  readonly data: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number
  ) {
    this.data = new Uint8Array(width * height * 4);
  }

  fill(color: Rgb) {
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = color.r;
      this.data[i + 1] = color.g;
      this.data[i + 2] = color.b;
      this.data[i + 3] = 255;
    }
  }

  /** Draws an anti-aliased rounded rectangle, blended over what's beneath. */
  roundedRect(
    cx: number,
    cy: number,
    halfW: number,
    halfH: number,
    radius: number,
    color: Rgb,
    alpha = 1
  ) {
    // Bounding box, clamped, plus a pixel of slack for the AA edge.
    const x0 = Math.max(0, Math.floor(cx - halfW - 1));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + halfW + 1));
    const y0 = Math.max(0, Math.floor(cy - halfH - 1));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + halfH + 1));

    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const d = roundedRectDistance(x + 0.5, y + 0.5, cx, cy, halfW, halfH, radius);
        // Coverage ramps across one pixel either side of the boundary.
        const coverage = Math.min(1, Math.max(0, 0.5 - d));
        if (coverage <= 0) continue;

        const a = coverage * alpha;
        const i = (y * this.width + x) * 4;
        this.data[i] = Math.round(this.data[i] * (1 - a) + color.r * a);
        this.data[i + 1] = Math.round(this.data[i + 1] * (1 - a) + color.g * a);
        this.data[i + 2] = Math.round(this.data[i + 2] * (1 - a) + color.b * a);
        this.data[i + 3] = 255;
      }
    }
  }

  toPng(): Buffer {
    return encodePng(this.data, this.width, this.height);
  }
}
