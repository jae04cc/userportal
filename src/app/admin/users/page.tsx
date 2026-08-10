import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { groups, userGroups, users } from "@/lib/db/schema";
import { Button, Panel } from "@/components/admin/ui";
import { deleteUser, setUserActive, setUserPortalGroups } from "@/lib/actions/people";
import { getOidcConfig } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const [allUsers, allGroups, memberships, oidc] = await Promise.all([
    db.select().from(users).orderBy(asc(users.username)),
    db.select().from(groups).orderBy(asc(groups.name)),
    db.select().from(userGroups),
    getOidcConfig(),
  ]);

  const groupNames = new Map(allGroups.map((g) => [g.id, g.name]));

  // Kept apart because only the portal-assigned set is editable here.
  const portalGroupIds = new Map<string, string[]>();
  const idpGroupNames = new Map<string, string[]>();
  for (const m of memberships) {
    const name = groupNames.get(m.groupId);
    if (!name) continue;
    if (m.source === "idp") {
      idpGroupNames.set(m.userId, [...(idpGroupNames.get(m.userId) ?? []), name]);
    } else {
      portalGroupIds.set(m.userId, [...(portalGroupIds.get(m.userId) ?? []), m.groupId]);
    }
  }

  return (
    <>
      <Panel title="How users get here">
        <p className="text-sm text-slate-400">
          Accounts are created automatically the first time someone signs in through{" "}
          {oidc.enabled ? oidc.displayName : "your identity provider"}.
        </p>
        <p className="mt-2 text-sm text-slate-400">
          Group membership comes from <strong className="text-slate-200">two sources</strong>: what
          your identity provider sends in the groups claim, and what you grant here. A user gets
          both. Claim-derived groups refresh on every sign-in; groups you grant here stick until you
          remove them. Admin rights come only from the configured admin group.
        </p>
      </Panel>

      <Panel title="Users">
        {allUsers.length === 0 ? (
          <p className="text-sm text-slate-500">No accounts yet.</p>
        ) : (
          <ul className="space-y-2">
            {allUsers.map((user) => {
              const portalIds = portalGroupIds.get(user.id) ?? [];
              const idpNames = idpGroupNames.get(user.id) ?? [];

              return (
                <li
                  key={user.id}
                  className="rounded-md border border-surface-border bg-surface-base p-3"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-100">
                      {user.displayName?.trim() || user.username}
                    </span>
                    <span className="text-xs text-slate-600">{user.username}</span>

                    {user.isAdmin ? (
                      <span className="rounded bg-surface-hover px-1.5 py-0.5 text-xs text-sky-400">
                        Admin
                      </span>
                    ) : null}
                    {user.isBootstrap ? (
                      <span className="rounded bg-surface-hover px-1.5 py-0.5 text-xs text-amber-400">
                        Bootstrap (local password)
                      </span>
                    ) : null}
                    {user.oidcSub ? (
                      <span className="rounded bg-surface-hover px-1.5 py-0.5 text-xs text-emerald-400">
                        SSO
                      </span>
                    ) : null}
                    {!user.isActive ? (
                      <span className="rounded bg-red-950/60 px-1.5 py-0.5 text-xs text-red-300">
                        Suspended
                      </span>
                    ) : null}

                    <span className="ml-auto text-xs text-slate-600">
                      {user.lastLoginAt
                        ? `last seen ${new Date(user.lastLoginAt).toLocaleString()}`
                        : "never signed in"}
                    </span>
                  </div>

                  {idpNames.length > 0 ? (
                    <p className="mb-2 text-xs text-slate-500">
                      From your identity provider:{" "}
                      <span className="text-slate-300">{idpNames.join(", ")}</span>{" "}
                      <span className="text-slate-600">
                        (refreshed on each sign-in, not editable here)
                      </span>
                    </p>
                  ) : null}

                  <form action={setUserPortalGroups} className="mb-3">
                    <input type="hidden" name="userId" value={user.id} />
                    <fieldset>
                      <legend className="mb-1.5 text-xs text-slate-500">
                        Groups granted in the portal
                      </legend>
                      {allGroups.length === 0 ? (
                        <p className="mb-2 text-xs text-slate-600">
                          No groups yet — create one on the Groups tab.
                        </p>
                      ) : (
                        <div className="mb-2 flex flex-wrap gap-3">
                          {allGroups.map((g) => (
                            <label
                              key={g.id}
                              className="flex items-center gap-2 text-sm text-slate-300"
                            >
                              <input
                                type="checkbox"
                                name="groupIds"
                                value={g.id}
                                defaultChecked={portalIds.includes(g.id)}
                                className="h-4 w-4"
                              />
                              {g.name}
                            </label>
                          ))}
                        </div>
                      )}
                    </fieldset>
                    <Button type="submit">Save groups</Button>
                  </form>

                  <div className="flex flex-wrap gap-2">
                    <form action={setUserActive}>
                      <input type="hidden" name="id" value={user.id} />
                      <input type="hidden" name="active" value={user.isActive ? "false" : "true"} />
                      <Button type="submit" variant={user.isActive ? "danger" : "default"}>
                        {user.isActive ? "Suspend" : "Reactivate"}
                      </Button>
                    </form>

                    {!user.isBootstrap ? (
                      <form action={deleteUser}>
                        <input type="hidden" name="id" value={user.id} />
                        <Button type="submit" variant="danger">
                          Delete
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
