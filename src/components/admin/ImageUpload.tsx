"use client";

import { useRef, useState } from "react";
import { describeRescale, fitWithin, needsRescale, type Size } from "@/lib/imageScale";
import { cn } from "@/lib/utils";

/**
 * Re-renders an upload at a sane size before it is stored.
 *
 * Done here rather than on the server because the browser already has a decoder
 * for every format the file input accepts — PNG, JPEG, WebP, GIF and SVG — and
 * the alternative is a hand-written PNG decoder plus a resampler for one
 * branding feature.
 *
 * It never blocks an upload. Anything that goes wrong — a format the browser
 * won't decode, an SVG that taints the canvas, a missing 2D context — falls
 * back to sending the original bytes, which is exactly the old behaviour.
 */
type Decoded = {
  source: CanvasImageSource;
  size: Size;
  /** Releases the bitmap or object URL. Only safe to call after drawing. */
  release: () => void;
};

/**
 * Decodes an upload, by whichever route works.
 *
 * `createImageBitmap` is tried first: it is the more reliable decoder for raster
 * formats and doesn't need the image attached to a document. It does not handle
 * SVG, so `<img>` is the fallback — that path covers SVG but is fussier, and in
 * some browsers refuses files createImageBitmap accepts happily.
 */
async function decode(file: File): Promise<Decoded | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        size: { width: bitmap.width, height: bitmap.height },
        release: () => bitmap.close(),
      };
    } catch {
      // Most likely an SVG. Fall through to the <img> path.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    // An SVG with no intrinsic size reports 0 and can't be scaled meaningfully.
    if (!img.naturalWidth || !img.naturalHeight) {
      URL.revokeObjectURL(url);
      return null;
    }
    return {
      source: img,
      size: { width: img.naturalWidth, height: img.naturalHeight },
      release: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

async function rescale(file: File, max: number): Promise<{ file: File; note: string | null }> {
  const decoded = await decode(file);
  if (!decoded) return { file, note: null };

  try {
    const from = decoded.size;
    if (!needsRescale({ size: from, type: file.type }, max)) {
      return { file, note: describeRescale(from, from, false) };
    }

    const to = fitWithin(from, max);
    const canvas = document.createElement("canvas");
    canvas.width = to.width;
    canvas.height = to.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return { file, note: null };
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(decoded.source, 0, 0, to.width, to.height);

    // Throws a SecurityError if an SVG tainted the canvas, caught below.
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return { file, note: null };

    const name = file.name.replace(/\.[^.]+$/, "") + ".png";
    return {
      file: new File([blob], name, { type: "image/png" }),
      note: describeRescale(from, to, file.type !== "image/png"),
    };
  } catch {
    return { file, note: null };
  } finally {
    decoded.release();
  }
}

/**
 * Uploads an image and writes the resulting `/api/icons/…` path into a hidden
 * field, so the surrounding server-action form saves it like any other value.
 *
 * The upload happens immediately rather than on form submit: server actions
 * would have to carry the file bytes through the action payload, and the upload
 * endpoint already exists with the validation on it.
 *
 * Deliberately no free-text URL field. Branding artwork is read back off disk to
 * be re-served as the app icon, so it has to be a file this app wrote.
 */
export function ImageUpload({
  name,
  initial,
  label,
  /** Tailwind classes for the preview box — banners and logos are shaped differently. */
  previewClass,
  /**
   * Longest side to store, in pixels. Set for artwork that ends up in an icon
   * slot; left unset for the banner, where the full resolution is the point.
   */
  maxPixels,
}: {
  name: string;
  initial: string | null;
  label: string;
  previewClass: string;
  maxPixels?: number;
}) {
  const [value, setValue] = useState(initial ?? "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(picked: File) {
    setUploading(true);
    setError(null);
    setNote(null);
    try {
      const { file, note: what } = maxPixels
        ? await rescale(picked, maxPixels)
        : { file: picked, note: null };

      const body = new FormData();
      body.append("file", file);
      // Branding artwork gets the larger size limit.
      body.append("kind", "branding");
      const res = await fetch("/api/admin/icons", { method: "POST", body });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setError(json.error ?? "Upload failed.");
        return;
      }
      setValue(json.url);
      setNote(what);
    } catch {
      setError("Upload failed.");
    } finally {
      setUploading(false);
      // Clearing lets the same file be re-picked, which otherwise fires no
      // change event and looks like the button stopped working.
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div>
      <input type="hidden" name={name} value={value} />

      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            "flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-surface-border bg-surface-base",
            previewClass
          )}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element -- uploads are
            // arbitrary user files on this origin; next/image adds nothing here.
            <img src={value} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="px-2 text-center text-xs text-slate-600">None</span>
          )}
        </span>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="rounded-md border border-sky-600 bg-sky-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-sky-500 disabled:opacity-50"
          >
            {uploading ? "Uploading…" : value ? `Replace ${label}` : `Upload ${label}`}
          </button>

          {value ? (
            <button
              type="button"
              onClick={() => setValue("")}
              className="rounded-md border border-surface-border px-3 py-1.5 text-sm text-slate-300 transition-colors hover:bg-surface-hover"
            >
              Remove
            </button>
          ) : null}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      {note ? (
        <p role="status" className="mt-2 text-xs text-emerald-400">
          {note}
        </p>
      ) : null}

      {/* Removing only clears the setting; the file stays on disk. Saying so
          avoids the assumption that this is how you delete an upload. */}
      <p className="mt-2 text-xs text-slate-600">
        Changes apply when you save. Nothing is deleted from disk.
      </p>
    </div>
  );
}
