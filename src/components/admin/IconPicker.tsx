"use client";

import { useMemo, useRef, useState } from "react";
import { ICON_CATALOG, ICON_NAMES } from "./iconCatalog";
import { inputClass } from "./ui";
import { cn } from "@/lib/utils";
import { isImageIcon } from "@/lib/icons";

/**
 * Three ways to set a service icon, all writing to the same hidden `icon` field:
 *   1. pick from the curated lucide catalog
 *   2. upload an image (uploaded logos win for real self-hosted apps)
 *   3. type any lucide name or image URL by hand
 */
export function IconPicker({ name, initial, uid }: { name: string; initial: string; uid: string }) {
  const [value, setValue] = useState(initial);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const names = q ? ICON_NAMES.filter((n) => n.includes(q)) : ICON_NAMES;
    return names.slice(0, 60);
  }, [query]);

  // Same predicate the portal card uses, so the preview can never disagree
  // with what users actually see.
  const isImage = isImageIcon(value);
  const Preview = !isImage && value ? ICON_CATALOG[value] : null;

  async function upload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/icons", { method: "POST", body });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setUploadError(json.error ?? "Upload failed.");
        return;
      }
      setValue(json.url);
      setOpen(false);
    } catch {
      setUploadError("Upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div>
      <input type="hidden" name={name} value={value} />

      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-surface-border bg-surface-base">
          {isImage ? (
            <img src={value} alt="" className="h-5 w-5 object-contain" />
          ) : Preview ? (
            <Preview className="h-5 w-5 text-slate-300" aria-hidden="true" />
          ) : (
            <span className="text-xs text-slate-600">—</span>
          )}
        </span>

        <input
          id={`icon-${uid}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="lucide name or image URL"
          className={inputClass}
        />

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="shrink-0 rounded-md border border-surface-border px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-surface-hover"
        >
          {open ? "Close" : "Browse"}
        </button>
      </div>

      {open ? (
        <div className="mt-2 rounded-md border border-surface-border bg-surface-base p-3">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search icons…"
              aria-label="Search icons"
              className={cn(inputClass, "flex-1")}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="shrink-0 rounded-md border border-sky-600 bg-sky-600 px-3 py-2 text-sm text-white transition-colors hover:bg-sky-500 disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Upload image"}
            </button>
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

          {uploadError ? (
            <p role="alert" className="mb-2 text-sm text-red-300">
              {uploadError}
            </p>
          ) : null}

          <div className="grid max-h-56 grid-cols-8 gap-1 overflow-y-auto sm:grid-cols-12">
            {matches.map((iconName) => {
              const Icon = ICON_CATALOG[iconName];
              const selected = value === iconName;
              return (
                <button
                  key={iconName}
                  type="button"
                  title={iconName}
                  aria-label={iconName}
                  aria-pressed={selected}
                  onClick={() => {
                    setValue(iconName);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded transition-colors hover:bg-surface-hover",
                    selected && "bg-sky-600/30 ring-1 ring-sky-500"
                  )}
                >
                  <Icon className="h-4 w-4 text-slate-300" aria-hidden="true" />
                </button>
              );
            })}
          </div>

          {matches.length === 0 ? (
            <p className="text-sm text-slate-600">
              No match in the catalog. Any lucide icon name still works if you type it above.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
