import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { groups, userGroups } from "@/lib/db/schema";
import { Panel } from "@/components/admin/ui";
import { PasswordForm } from "@/components/AccountForms";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireUser();

  const memberships = await db
    .select({ name: groups.name })
    .from(userGroups)
    .innerJoin(groups, eq(userGroups.groupId, groups.id))
    .where(eq(userGroups.userId, user.id))
    .orderBy(asc(groups.name));

  return (
    <main id="main" className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-100 sm:text-2xl">Your account</h1>
        <Link
          href="/"
          className="rounded-md border border-surface-border px-3 py-1.5 text-sm text-slate-300 transition-colors hover:bg-surface-hover"
        >
          Back to portal
        </Link>
      </div>

      {user.mustChangePassword ? (
        <p
          role="alert"
          className="mb-6 rounded-md border border-amber-900 bg-amber-950/40 px-3 py-2 text-sm text-amber-300"
        >
          This account still uses its generated bootstrap password, which was printed to the server
          log. Change it below.
        </p>
      ) : null}

      <Panel title="Profile">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Name</dt>
            <dd className="text-slate-200">{user.displayName?.trim() || user.username}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Username</dt>
            <dd className="text-slate-200">{user.username}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Email</dt>
            <dd className="text-slate-200">{user.email || "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Groups</dt>
            <dd className="text-slate-200">
              {memberships.length > 0 ? memberships.map((m) => m.name).join(", ") : "—"}
            </dd>
          </div>
        </dl>

        {user.hasPassword ? null : (
          <p className="mt-4 text-xs text-slate-600">
            Your name, email, and groups come from your single sign-on account and update each time
            you sign in. To change them, change them there.
          </p>
        )}
      </Panel>

      {/*
        Only the bootstrap admin has a local password. Everyone else authenticates
        through the identity provider, so there is nothing here for them to manage.
      */}
      {user.hasPassword ? (
        <Panel
          title="Password"
          description="This is the local break-glass account. Keep this password somewhere safe — it's how you get back in if single sign-on breaks."
        >
          <PasswordForm />
        </Panel>
      ) : null}
    </main>
  );
}
