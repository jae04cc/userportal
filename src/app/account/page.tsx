import Link from "next/link";
import { requireUser } from "@/lib/authz";
import { Panel } from "@/components/admin/ui";
import { ProfileForm, PasswordForm } from "@/components/AccountForms";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireUser();

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
        <ProfileForm displayName={user.displayName ?? user.username} />
      </Panel>

      <Panel title="Password">
        {user.hasPassword ? (
          <PasswordForm />
        ) : (
          <p className="text-sm text-slate-500">
            This account signs in with single sign-on, so there&apos;s no local password to change.
          </p>
        )}
      </Panel>
    </main>
  );
}
