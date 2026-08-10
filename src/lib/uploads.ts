import "server-only";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { generateId } from "@/lib/utils";

/**
 * Uploaded icons live on the same volume as the SQLite database so a single
 * mount covers all persistent state.
 */
export const UPLOADS_DIR =
  process.env.UPLOADS_DIR ?? path.join(process.cwd(), "data", "uploads");

if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true });
}

const MAX_BYTES = 512 * 1024;

/**
 * Allow-list by both MIME type and extension. SVG is permitted because most
 * self-hosted app logos are SVG, and it's rendered exclusively through <img>,
 * where scripts inside an SVG do not execute. The serving route additionally
 * sends a locked-down CSP.
 */
const ALLOWED: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
};

export const ALLOWED_ICON_TYPES = Object.keys(ALLOWED);

export type UploadResult = { ok: true; url: string } | { ok: false; error: string };

export async function saveIconUpload(file: File): Promise<UploadResult> {
  if (!file || file.size === 0) return { ok: false, error: "No file was selected." };

  if (file.size > MAX_BYTES) {
    return { ok: false, error: `That file is ${Math.round(file.size / 1024)}KB; the limit is 512KB.` };
  }

  const ext = ALLOWED[file.type];
  if (!ext) {
    return { ok: false, error: `Unsupported type "${file.type}". Use PNG, JPEG, WebP, GIF, or SVG.` };
  }

  // Generated name — never trust the client-supplied filename, which is the
  // classic path-traversal vector.
  const name = `${generateId()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(UPLOADS_DIR, name), buffer);

  return { ok: true, url: `/api/icons/${name}` };
}

export async function listIcons(): Promise<string[]> {
  try {
    const files = await fs.readdir(UPLOADS_DIR);
    return files
      .filter((f) => Object.values(ALLOWED).includes(path.extname(f).toLowerCase()))
      .map((f) => `/api/icons/${f}`);
  } catch {
    return [];
  }
}

export async function deleteIcon(fileName: string): Promise<boolean> {
  // Re-derive the basename so "../../etc/passwd" can't escape the directory.
  const safe = path.basename(fileName);
  if (safe !== fileName) return false;

  try {
    await fs.unlink(path.join(UPLOADS_DIR, safe));
    return true;
  } catch {
    return false;
  }
}

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

export async function readIcon(
  fileName: string
): Promise<{ body: Buffer; contentType: string } | null> {
  const safe = path.basename(fileName);
  if (safe !== fileName) return null;

  const contentType = CONTENT_TYPES[path.extname(safe).toLowerCase()];
  if (!contentType) return null;

  try {
    const body = await fs.readFile(path.join(UPLOADS_DIR, safe));
    return { body, contentType };
  } catch {
    return null;
  }
}
