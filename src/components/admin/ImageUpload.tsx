"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

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
}: {
  name: string;
  initial: string | null;
  label: string;
  previewClass: string;
}) {
  const [value, setValue] = useState(initial ?? "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
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

      {/* Removing only clears the setting; the file stays on disk. Saying so
          avoids the assumption that this is how you delete an upload. */}
      <p className="mt-2 text-xs text-slate-600">
        Changes apply when you save. Nothing is deleted from disk.
      </p>
    </div>
  );
}
