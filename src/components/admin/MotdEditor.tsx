"use client";

import { useState } from "react";
import { updateMotd } from "@/lib/actions/catalog";
import { Motd } from "@/components/Motd";
import { Button, inputClass } from "./ui";

/**
 * Markdown textarea with a live preview rendered by the exact same <Motd>
 * component the landing page uses, so what an admin sees here is what users get.
 */
export function MotdEditor({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);

  return (
    <form action={updateMotd} className="space-y-4">
      <div>
        <label htmlFor="motd" className="mb-1 block text-sm text-slate-400">
          Announcement (markdown)
        </label>
        <textarea
          id="motd"
          name="motd"
          rows={6}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={`${inputClass} font-mono`}
          placeholder="**Maintenance Sunday 2am** — Jellyfin will be down for ~30 minutes."
        />
        <p className="mt-1 text-xs text-slate-600">
          Supports bold, italic, links, and lists. Raw HTML is not rendered. Leave empty to hide the
          banner entirely.
        </p>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Preview</p>
        {value.trim() ? (
          <Motd markdown={value} />
        ) : (
          <p className="rounded-lg border border-dashed border-surface-border px-4 py-6 text-center text-sm text-slate-600">
            Nothing to show — the banner will be hidden.
          </p>
        )}
      </div>

      <Button type="submit" variant="primary">
        Save announcement
      </Button>
    </form>
  );
}
