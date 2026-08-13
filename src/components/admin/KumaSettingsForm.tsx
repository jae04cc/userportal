"use client";

import { saveKumaSettings } from "@/lib/actions/monitoring";
import { SaveForm } from "./SaveBar";
import { Field, inputClass } from "./ui";

export function KumaSettingsForm({
  baseUrl,
  slug,
  showUptime,
}: {
  baseUrl: string;
  slug: string;
  showUptime: boolean;
}) {
  return (
    // The action is written for useFormState, so it takes a previous-state
    // argument this form has no use for. The connection test it runs comes back
    // as a message and is reported by the save bar.
    <SaveForm
      action={(form) => saveKumaSettings(null, form)}
      label="Uptime Kuma connection"
      className="grid gap-3 sm:grid-cols-2"
    >
      <Field
        label="Uptime Kuma base URL"
        htmlFor="kuma-base"
        hint="Where the portal reaches Kuma from inside your network."
      >
        <input
          id="kuma-base"
          name="baseUrl"
          defaultValue={baseUrl}
          placeholder="https://uptime.example.com"
          className={inputClass}
        />
      </Field>

      <Field
        label="Status page slug"
        htmlFor="kuma-slug"
        hint="From the status page URL: /status/<slug>. It must be published."
      >
        <input
          id="kuma-slug"
          name="slug"
          defaultValue={slug}
          placeholder="services"
          className={inputClass}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm text-slate-400 sm:col-span-2">
        <input type="checkbox" name="showUptime" defaultChecked={showUptime} className="h-4 w-4" />
        Show 24-hour uptime percentage on service cards
      </label>

      <p className="text-xs text-slate-600 sm:col-span-2">
        Saving also tests the connection and reports what it found. Clear both fields and save to
        turn monitoring off entirely.
      </p>
    </SaveForm>
  );
}
