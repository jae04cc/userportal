import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { groups, userGroups, users } from "@/lib/db/schema";
import { Button, Field, Panel, inputClass } from "@/components/admin/ui";
import { createUser, deleteUser, setUserGroups, updateUser } from "@/lib/actions/people";
import { isOidcEnabled } from "@/auth";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const [allUsers, allGroups, memberships] = await Promise.all([
    db.select().from(users).orderBy(asc(users.username)),
    db.select().from(groups).orderBy(asc(groups.sortOrder), asc(groups.name)),
    db.select().from(userGroups),
  ]);

  const groupsByUser = new Map<string, string[]>();
  for (const m of memberships) {
    groupsByUser.set(m.userId, [...(groupsByUser.get(m.userId) ?? []), m.groupId]);
  }

  return (
    <>
      <Panel
        title="Add a user"
        description="Leave the password blank to create an SSO-only account that cannot use the local login."
      >
        <form action={createUser} className="grid gap-3 sm:grid-cols-2">
          <Field label="Username" htmlFor="new-username" hint="Stored lowercase; login is case-insensitive.">
            <input id="new-username" name="username" required className={inputClass} />
          </Field>
          <Field label="Display name" htmlFor="new-displayname">
            <input id="new-displayname" name="displayName" className={inputClass} />
          </Field>
          <Field label="Email" htmlFor="new-email">
            <input id="new-email" name="email" type="email" className={inputClass} />
          </Field>
          <Field label="Password" htmlFor="new-password">
            <input
              id="new-password"
              name="password"
              type="password"
              autoComplete="new-password"
              className={inputClass}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input type="checkbox" name="isAdmin" className="h-4 w-4" />
            Administrator
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" variant="primary">
              Add user
            </Button>
          </div>
        </form>
      </Panel>

      <Panel title="Users">
        <ul className="space-y-3">
          {allUsers.map((user) => {
            const userGroupIds = groupsByUser.get(user.id) ?? [];

            return (
              <li key={user.id} className="rounded-md border border-surface-border bg-surface-base p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-100">{user.username}</span>
                  {user.isAdmin ? (
                    <span className="rounded bg-surface-hover px-1.5 py-0.5 text-xs text-sky-400">
                      Admin
                    </span>
                  ) : null}
                  {user.oidcSub ? (
                    <span className="rounded bg-surface-hover px-1.5 py-0.5 text-xs text-emerald-400">
                      SSO linked
                    </span>
                  ) : null}
                  {!user.passwordHash ? (
                    <span className="rounded bg-surface-hover px-1.5 py-0.5 text-xs text-slate-500">
                      No local password
                    </span>
                  ) : null}
                  {!user.isActive ? (
                    <span className="rounded bg-red-950/60 px-1.5 py-0.5 text-xs text-red-300">
                      Suspended
                    </span>
                  ) : null}
                  <span className="text-xs text-slate-600">
                    {user.lastLoginAt
                      ? `last seen ${new Date(user.lastLoginAt).toLocaleDateString()}`
                      : "never signed in"}
                  </span>
                </div>

                <details>
                  <summary className="cursor-pointer text-sm text-sky-400">Edit</summary>

                  <form action={updateUser} className="mt-3 grid gap-3 sm:grid-cols-2">
                    <input type="hidden" name="id" value={user.id} />
                    <Field label="Display name" htmlFor={`dn-${user.id}`}>
                      <input
                        id={`dn-${user.id}`}
                        name="displayName"
                        defaultValue={user.displayName ?? ""}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Email" htmlFor={`em-${user.id}`}>
                      <input
                        id={`em-${user.id}`}
                        name="email"
                        type="email"
                        defaultValue={user.email ?? ""}
                        className={inputClass}
                      />
                    </Field>
                    <Field
                      label="Set new password"
                      htmlFor={`pw-${user.id}`}
                      hint="Leave blank to keep the current one."
                    >
                      <input
                        id={`pw-${user.id}`}
                        name="password"
                        type="password"
                        autoComplete="new-password"
                        className={inputClass}
                      />
                    </Field>
                    {isOidcEnabled ? (
                      <Field
                        label="OIDC subject"
                        htmlFor={`sub-${user.id}`}
                        hint="Paste the Authentik user's `sub` to link this account to SSO. Never inferred from email."
                      >
                        <input
                          id={`sub-${user.id}`}
                          name="oidcSub"
                          defaultValue={user.oidcSub ?? ""}
                          className={inputClass}
                        />
                      </Field>
                    ) : (
                      <input type="hidden" name="oidcSub" value={user.oidcSub ?? ""} />
                    )}
                    <label className="flex items-center gap-2 text-sm text-slate-400">
                      <input
                        type="checkbox"
                        name="isAdmin"
                        defaultChecked={user.isAdmin}
                        className="h-4 w-4"
                      />
                      Administrator
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-400">
                      <input
                        type="checkbox"
                        name="isActive"
                        defaultChecked={user.isActive}
                        className="h-4 w-4"
                      />
                      Active
                      <span className="text-xs text-slate-600">
                        (unticking suspends access immediately)
                      </span>
                    </label>
                    <div className="sm:col-span-2">
                      <Button type="submit">Save user</Button>
                    </div>
                  </form>

                  <form action={setUserGroups} className="mt-4">
                    <input type="hidden" name="userId" value={user.id} />
                    <fieldset>
                      <legend className="mb-1 text-sm text-slate-400">Group membership</legend>
                      {allGroups.length === 0 ? (
                        <p className="text-sm text-slate-600">No groups exist yet.</p>
                      ) : (
                        <div className="mb-2 flex flex-wrap gap-3">
                          {allGroups.map((g) => (
                            <label key={g.id} className="flex items-center gap-2 text-sm text-slate-300">
                              <input
                                type="checkbox"
                                name="groupIds"
                                value={g.id}
                                defaultChecked={userGroupIds.includes(g.id)}
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

                  <form action={deleteUser} className="mt-4">
                    <input type="hidden" name="id" value={user.id} />
                    <Button type="submit" variant="danger">
                      Delete user
                    </Button>
                  </form>
                </details>
              </li>
            );
          })}
        </ul>
      </Panel>
    </>
  );
}
