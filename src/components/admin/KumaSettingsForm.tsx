"use client";

import { useFormState, useFormStatus } from "react-dom";
import { saveKumaSettings, type ActionResult } from "@/lib/actions/monitoring";
import { Button, Field, inputClass } from "./ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? "Saving and testing…" : "Save and test connection"}
    </Button>
  );
}

export function KumaSettingsForm({
  baseUrl,
  slug,
  showUptime,
}: {
  baseUrl: string;
  slug: string;
  showUptime: boolean;
}) {
  const [state, formAction] = useFormState<ActionResult | null, FormData>(saveKumaSettings, null);

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-2">
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

      {state ? (
        <p
          role="status"
          className={`sm:col-span-2 rounded-md border px-3 py-2 text-sm ${
            state.ok
              ? "border-emerald-900 bg-emerald-950/40 text-emerald-300"
              : "border-amber-900 bg-amber-950/40 text-amber-300"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <div className="sm:col-span-2">
        <SubmitButton />
        <p className="mt-2 text-xs text-slate-600">
          Clear both fields and save to turn monitoring off entirely.
        </p>
      </div>
    </form>
  );
}
