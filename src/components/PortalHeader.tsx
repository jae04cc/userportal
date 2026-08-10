import Link from "next/link";
import { signOut } from "@/auth";
import type { CurrentUser } from "@/lib/authz";

export function PortalHeader({ user }: { user: CurrentUser }) {
  const name = user.displayName?.trim() || user.username;

  return (
    <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-100 sm:text-2xl">
          {greeting()}, {name}
        </h1>
        <p className="text-sm text-slate-500">Your services, in one place.</p>
      </div>

      <nav className="flex items-center gap-2 text-sm">
        <Link
          href="/account"
          className="rounded-md border border-surface-border px-3 py-1.5 text-slate-300 transition-colors hover:bg-surface-hover"
        >
          Account
        </Link>
        {user.isAdmin ? (
          <Link
            href="/admin"
            className="rounded-md border border-surface-border px-3 py-1.5 text-slate-300 transition-colors hover:bg-surface-hover"
          >
            Admin
          </Link>
        ) : null}
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button
            type="submit"
            className="rounded-md border border-surface-border px-3 py-1.5 text-slate-300 transition-colors hover:bg-surface-hover"
          >
            Sign out
          </button>
        </form>
      </nav>
    </header>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
