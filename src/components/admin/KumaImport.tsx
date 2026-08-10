"use client";

import { useFormState, useFormStatus } from "react-dom";
import { importKumaMonitors, type ActionResult } from "@/lib/actions/monitoring";
import { Button } from "./ui";
import type { DiscoveredMonitor } from "@/lib/status/types";

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending || disabled}>
      {pending ? "Importing…" : "Import selected"}
    </Button>
  );
}

export function KumaImport({
  monitors,
  boundKeys,
}: {
  monitors: DiscoveredMonitor[];
  /** Monitor ids/names already bound to a service, shown as already imported. */
  boundKeys: string[];
}) {
  const [state, formAction] = useFormState<ActionResult | null, FormData>(importKumaMonitors, null);

  const bound = new Set(boundKeys);
  const groups = new Map<string, DiscoveredMonitor[]>();
  for (const monitor of monitors) {
    groups.set(monitor.groupName, [...(groups.get(monitor.groupName) ?? []), monitor]);
  }

  const available = monitors.filter((m) => !bound.has(m.id) && !bound.has(m.name));

  if (monitors.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No monitors found. Check the connection settings above — the status page must be published
        and have monitors on it.
      </p>
    );
  }

  return (
    <form action={formAction}>
      <p className="mb-3 text-sm text-slate-500">
        Kuma&apos;s status page groups become portal categories. Imported services are created{" "}
        <strong className="text-slate-300">disabled and admin-only</strong> with a placeholder URL —
        set each one&apos;s real URL on the Services tab, then enable it.
      </p>

      <div className="mb-4 space-y-4">
        {[...groups.entries()].map(([groupName, groupMonitors]) => (
          <fieldset key={groupName}>
            <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {groupName}
            </legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {groupMonitors.map((monitor) => {
                const already = bound.has(monitor.id) || bound.has(monitor.name);
                return (
                  <label
                    key={monitor.id}
                    className={`flex items-center gap-2 text-sm ${
                      already ? "text-slate-600" : "text-slate-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="monitorIds"
                      value={monitor.id}
                      disabled={already}
                      defaultChecked={!already}
                      className="h-4 w-4"
                    />
                    {monitor.name}
                    {already ? <span className="text-xs">(already imported)</span> : null}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      {state ? (
        <p
          role="status"
          className={`mb-3 rounded-md border px-3 py-2 text-sm ${
            state.ok
              ? "border-emerald-900 bg-emerald-950/40 text-emerald-300"
              : "border-amber-900 bg-amber-950/40 text-amber-300"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <SubmitButton disabled={available.length === 0} />
      {available.length === 0 ? (
        <p className="mt-2 text-xs text-slate-600">Every monitor on this status page is imported.</p>
      ) : null}
    </form>
  );
}
