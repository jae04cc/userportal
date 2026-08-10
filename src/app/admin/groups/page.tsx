import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { groups, userGroups } from "@/lib/db/schema";
import { Button, Field, Panel, inputClass } from "@/components/admin/ui";
import { createGroup, deleteGroup, updateGroup, setDefaultGroup } from "@/lib/actions/people";
import { getSetting, SETTING_KEYS } from "@/lib/settings";
import { isOidcEnabled } from "@/auth";

export const dynamic = "force-dynamic";

export default async function AdminGroupsPage() {
  const allGroups = await db.select().from(groups).orderBy(asc(groups.sortOrder), asc(groups.name));
  const defaultGroupId = await getSetting(SETTING_KEYS.defaultGroupId);

  const counts = await db
    .select({ groupId: userGroups.groupId, count: sql<number>`COUNT(*)` })
    .from(userGroups)
    .groupBy(userGroups.groupId);
  const countByGroup = new Map(counts.map((c) => [c.groupId, Number(c.count)]));

  return (
    <>
      <Panel
        title="Add a group"
        description="Access groups control which services a user can see. They are separate from the display categories on the Services tab."
      >
        <form action={createGroup} className="grid gap-3 sm:grid-cols-2">
          <Field label="Group name" htmlFor="new-group-name">
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

      {isOidcEnabled ? (
        <Panel
          title="Default group for new SSO users"
          description="Someone signing in with SSO for the first time is auto-provisioned. Without a default group they'd see only services visible to everyone."
        >
          <form action={setDefaultGroup} className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1">
              <Field label="Group" htmlFor="default-group">
                <select
                  id="default-group"
                  name="groupId"
                  defaultValue={defaultGroupId ?? ""}
                  className={inputClass}
                >
                  <option value="">None — new users start with no groups</option>
                  {allGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Button type="submit">Save</Button>
          </form>
        </Panel>
      ) : null}

      <Panel title="Groups">
        {allGroups.length === 0 ? (
          <p className="text-sm text-slate-500">No groups yet.</p>
        ) : (
          <ul className="space-y-3">
            {allGroups.map((group) => (
              <li key={group.id} className="rounded-md border border-surface-border bg-surface-base p-3">
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
                  <div className="flex items-center gap-2 sm:col-span-2">
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
