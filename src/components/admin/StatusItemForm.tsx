"use client";

import { useState, type ReactNode } from "react";
import { SaveForm } from "./SaveBar";
import { Button, Field, inputClass } from "./ui";
import type { ServiceVisibility } from "@/lib/db/schema";

export type StatusItemValues = {
  id?: string;
  label: string;
  monitorKey: string;
  visibility: ServiceVisibility;
  isEnabled: boolean;
  groupIds: string[];
};

/** Shared by add and edit. Mirrors ServiceForm so the two feel like one system. */
export function StatusItemForm({
  action,
  groups,
  monitors,
  initial,
  submitLabel,
}: {
  action: (form: FormData) => void;
  groups: Array<{ id: string; name: string }>;
  monitors: Array<{ id: string; name: string }>;
  initial: StatusItemValues;
  /** Present for the add form, which keeps its own button. See ServiceForm. */
  submitLabel?: string;
}) {
  const [visibility, setVisibility] = useState<ServiceVisibility>(initial.visibility);
  const uid = initial.id ?? "new";

  const wrap = (children: ReactNode) =>
    submitLabel ? (
      <form action={action} className="grid gap-3 sm:grid-cols-2">
        {children}
        <div className="sm:col-span-2">
          <Button type="submit" variant="primary">
            {submitLabel}
          </Button>
        </div>
      </form>
    ) : (
      <SaveForm
        action={action}
        label={initial.label || "Tile"}
        className="grid gap-3 sm:grid-cols-2"
      >
        {children}
      </SaveForm>
    );

  return wrap(
    <>
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}

      <Field label="Label" htmlFor={`label-${uid}`} hint="What the tile is called on the portal.">
        <input
          id={`label-${uid}`}
          name="label"
          required
          defaultValue={initial.label}
          className={inputClass}
        />
      </Field>

      <Field
        label="Uptime Kuma monitor"
        htmlFor={`monitor-${uid}`}
        hint={
          monitors.length > 0
            ? "Bound by monitor id, so renaming it in Kuma won't break the tile."
            : "Configure Uptime Kuma on the Monitoring tab to pick from a list."
        }
      >
        {monitors.length > 0 ? (
          <select
            id={`monitor-${uid}`}
            name="monitorKey"
            defaultValue={initial.monitorKey}
            className={inputClass}
          >
            {/* Keeps a hand-typed or now-missing binding selectable rather than
                silently rewriting it to the first monitor in the list. */}
            {initial.monitorKey && !monitors.some((m) => m.id === initial.monitorKey) ? (
              <option value={initial.monitorKey}>{initial.monitorKey} (not on status page)</option>
            ) : null}
            {monitors.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={`monitor-${uid}`}
            name="monitorKey"
            required
            defaultValue={initial.monitorKey}
            className={inputClass}
          />
        )}
      </Field>

      <Field label="Who can see this" htmlFor={`visibility-${uid}`}>
        <select
          id={`visibility-${uid}`}
          name="visibility"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as ServiceVisibility)}
          className={inputClass}
        >
          <option value="all">Everyone signed in</option>
          <option value="groups">Specific groups</option>
          <option value="admin">Admins only</option>
        </select>
      </Field>

      <div className="flex items-end">
        <label className="flex items-center gap-2 text-sm text-slate-400">
          <input
            type="checkbox"
            name="isEnabled"
            defaultChecked={initial.isEnabled}
            className="h-4 w-4"
          />
          Show on the pane
        </label>
      </div>

      {visibility === "groups" ? (
        <fieldset className="sm:col-span-2">
          <legend className="mb-1 text-sm text-slate-400">Visible to groups</legend>
          {groups.length === 0 ? (
            <p className="text-sm text-slate-600">
              No groups exist yet — they appear as people sign in, or add one on the Groups tab.
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {groups.map((g) => (
                <label key={g.id} className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    name="groupIds"
                    value={g.id}
                    defaultChecked={initial.groupIds.includes(g.id)}
                    className="h-4 w-4"
                  />
                  {g.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      ) : null}
    </>
  );
}
