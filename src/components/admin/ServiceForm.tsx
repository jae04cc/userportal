"use client";

import { useState } from "react";
import { Button, Field, inputClass } from "./ui";
import { IconPicker } from "./IconPicker";
import type { ServiceKind, ServiceVisibility } from "@/lib/db/schema";

export type GroupOption = { id: string; name: string };

export type ServiceFormValues = {
  id?: string;
  categoryId: string;
  name: string;
  description: string;
  icon: string;
  kind: ServiceKind;
  url: string;
  content: string;
  monitorKey: string;
  visibility: ServiceVisibility;
  isEnabled: boolean;
  groupIds: string[];
};

/**
 * Shared by both create and edit. The group checkbox list is only meaningful
 * when visibility is "groups", so it's revealed conditionally — the value is
 * still submitted and the server ignores it for other modes.
 */
export function ServiceForm({
  action,
  categories,
  groups,
  initial,
  submitLabel,
}: {
  action: (form: FormData) => void;
  categories: Array<{ id: string; name: string }>;
  groups: GroupOption[];
  initial: ServiceFormValues;
  submitLabel: string;
}) {
  const [visibility, setVisibility] = useState<ServiceVisibility>(initial.visibility);
  const [kind, setKind] = useState<ServiceKind>(initial.kind);
  const uid = initial.id ?? "new";
  const isLink = kind === "link";

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}

      <Field label="Name" htmlFor={`name-${uid}`}>
        <input
          id={`name-${uid}`}
          name="name"
          required
          defaultValue={initial.name}
          className={inputClass}
        />
      </Field>

      <Field label="Category" htmlFor={`category-${uid}`}>
        <select
          id={`category-${uid}`}
          name="categoryId"
          defaultValue={initial.categoryId}
          className={inputClass}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="When clicked"
        htmlFor={`kind-${uid}`}
        hint={
          kind === "popup"
            ? "Opens your text in a dialog, without leaving the portal."
            : kind === "page"
              ? "Opens your text on its own page — linkable, and the back button works."
              : "Opens the URL below."
        }
      >
        <select
          id={`kind-${uid}`}
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as ServiceKind)}
          className={inputClass}
        >
          <option value="link">Open a link</option>
          <option value="popup">Show help in a popup</option>
          <option value="page">Show help on a page</option>
        </select>
      </Field>

      {isLink ? (
        <Field label="URL" htmlFor={`url-${uid}`}>
          <input
            id={`url-${uid}`}
            name="url"
            required
            defaultValue={initial.url}
            placeholder="https://jellyfin.example.com"
            className={inputClass}
          />
        </Field>
      ) : (
        // Keeps the previous URL through a round-trip, so switching to popup and
        // back doesn't silently lose it.
        <input type="hidden" name="url" value={initial.url} />
      )}

      <Field
        label="Icon"
        htmlFor={`icon-${uid}`}
        hint="Browse the catalog, upload a logo, or type any lucide name / image URL."
      >
        <IconPicker name="icon" initial={initial.icon} uid={uid} />
      </Field>

      <Field label="Description" htmlFor={`description-${uid}`}>
        <input
          id={`description-${uid}`}
          name="description"
          defaultValue={initial.description}
          className={inputClass}
        />
      </Field>

      <Field
        label="Uptime Kuma monitor name"
        htmlFor={`monitor-${uid}`}
        hint="Must match the monitor's name in Kuma exactly. Leave blank for no status indicator."
      >
        <input
          id={`monitor-${uid}`}
          name="monitorKey"
          defaultValue={initial.monitorKey}
          className={inputClass}
        />
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
          Enabled
        </label>
      </div>

      {!isLink ? (
        <div className="sm:col-span-2">
          <Field
            label="Content"
            htmlFor={`content-${uid}`}
            hint="Markdown. Enter starts a new line; a blank line starts a new paragraph with more space; --- draws a divider. Headings, bold, italic, links, lists, quotes and code all work. Raw HTML is not rendered."
          >
            <textarea
              id={`content-${uid}`}
              name="content"
              rows={8}
              defaultValue={initial.content}
              placeholder={"## Getting started\n\n1. Request access\n2. Sign in with SSO\n\nSee [the docs](https://example.com)."}
              className={`${inputClass} font-mono`}
            />
          </Field>
        </div>
      ) : null}

      {visibility === "groups" ? (
        <fieldset className="sm:col-span-2">
          <legend className="mb-1 text-sm text-slate-400">Visible to groups</legend>
          {groups.length === 0 ? (
            <p className="text-sm text-slate-600">
              No groups exist yet — create one on the Groups tab first.
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

      <div className="sm:col-span-2">
        <Button type="submit" variant="primary">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
