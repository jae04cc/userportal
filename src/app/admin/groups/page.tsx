import { asc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { groups, userGroups } from "@/lib/db/schema";
import { Button, Field, Panel, inputClass } from "@/components/admin/ui";
import { createGroup, deleteGroup, updateGroup } from "@/lib/actions/people";
import { getOidcConfig } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function AdminGroupsPage() {
  const [allGroups, counts, oidc] = await Promise.all([
    db.select().from(groups).orderBy(asc(groups.sortOrder), asc(groups.name)),
    db
      .select({ groupId: userGroups.groupId, count: sql<number>`COUNT(*)` })
      .from(userGroups)
      .groupBy(userGroups.groupId),
    getOidcConfig(),
  ]);

  const countByGroup = new Map(counts.map((c) => [c.groupId, Number(c.count)]));

  return (
    <>
      <Panel title="How groups work">
        <p className="text-sm text-slate-400">
          Groups live here in the portal — create as many as you like. You assign people to them on
          the <strong className="text-slate-200">Users</strong> tab.
        </p>
        <p className="mt-2 text-sm text-slate-400">
          Your identity provider can also grant membership: if a groups claim names a group that
          already exists here, that user joins it. A claim naming a group that doesn&apos;t exist
          yet creates it. Name matching is case-insensitive, so{" "}
          <code className="rounded bg-surface-base px-1 text-slate-200">Media</code> here matches{" "}
          <code className="rounded bg-surface-base px-1 text-slate-200">media</code> there.
        </p>
        <p className="mt-2 text-sm text-slate-400">
          The two sources coexist. Claim-derived membership refreshes on every sign-in; what you
          assign here is never touched by a sync.
        </p>
        {oidc.adminGroup ? (
          <p className="mt-2 text-sm text-slate-400">
            Members of{" "}
            <code className="rounded bg-surface-base px-1 text-slate-200">{oidc.adminGroup}</code>{" "}
            are portal admins.
          </p>
        ) : null}
      </Panel>

      <Panel title="Add a group">
        <form action={createGroup} className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Group name"
            htmlFor="new-group-name"
            hint="To also accept members from your identity provider, match its group name."
          >
            <input id="new-group-name" name="name" required className={inputClass} />
          </Field>
          <Field label="Description" htmlFor="new-group-desc">
            <input id="new-group-desc" name="description" className={inputClass} />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" variant="primary">
              Add group
            </Button>
          </div>
        </form>
      </Panel>

      <Panel title="Groups">
        {allGroups.length === 0 ? (
          <p className="text-sm text-slate-500">
            No groups yet. They appear here as people sign in, or add one by name above.
          </p>
        ) : (
          <ul className="space-y-3">
            {allGroups.map((group) => (
              <li
                key={group.id}
                className="rounded-md border border-surface-border bg-surface-base p-3"
              >
                <form action={updateGroup} className="grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="id" value={group.id} />
                  <Field label="Name" htmlFor={`group-name-${group.id}`}>
                    <input
                      id={`group-name-${group.id}`}
                      name="name"
                      defaultValue={group.name}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Description" htmlFor={`group-desc-${group.id}`}>
                    <input
                      id={`group-desc-${group.id}`}
                      name="description"
                      defaultValue={group.description ?? ""}
                      className={inputClass}
                    />
                  </Field>
                  <div className="flex items-center gap-3 sm:col-span-2">
                    <Button type="submit">Save</Button>
                    <span className="text-xs text-slate-600">
                      {countByGroup.get(group.id) ?? 0} member
                      {(countByGroup.get(group.id) ?? 0) === 1 ? "" : "s"}
                    </span>
                  </div>
                </form>

                <form action={deleteGroup} className="mt-2">
                  <input type="hidden" name="id" value={group.id} />
                  <Button type="submit" variant="danger">
                    Delete group
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
