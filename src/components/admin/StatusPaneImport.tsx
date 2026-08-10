"use client";

import { useFormState, useFormStatus } from "react-dom";
import { importStatusItems, type ImportResult } from "@/lib/actions/statusPane";
import { Button } from "./ui";
import type { DiscoveredMonitor } from "@/lib/status/types";

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending || disabled}>
      {pending ? "Adding…" : "Add selected"}
    </Button>
  );
}

export function StatusPaneImport({
  monitors,
  takenKeys,
}: {
  monitors: DiscoveredMonitor[];
  takenKeys: string[];
}) {
  const [state, formAction] = useFormState<ImportResult | null, FormData>(importStatusItems, null);

  const taken = new Set(takenKeys);
  const available = monitors.filter((m) => !taken.has(m.id) && !taken.has(m.name));

  if (monitors.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No monitors found. Check the connection on the Monitoring tab — the status page must be
        published and have monitors on it.
      </p>
    );
  }

  return (
    <form action={formAction}>
      <p className="mb-3 text-sm text-slate-500">
        Tiles are added <strong className="text-slate-300">admin-only</strong> so nothing appears on
        anyone&apos;s portal before you&apos;ve chosen who should see it.
      </p>

      <div className="mb-4 grid gap-1.5 sm:grid-cols-2">
        {monitors.map((monitor) => {
          const already = taken.has(monitor.id) || taken.has(monitor.name);
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
                className="h-4 w-4"
              />
              {monitor.name}
              {already ? <span className="text-xs">(already on the pane)</span> : null}
            </label>
          );
        })}
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
    </form>
  );
}
