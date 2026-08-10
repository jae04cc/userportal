import Link from "next/link";
import { Settings, ShieldCheck } from "lucide-react";
import type { CurrentUser } from "@/lib/authz";

/**
 * Deliberately minimal: a greeting and two icon links.
 *
 * Sign out lives on the account page rather than here — it's a rare, mildly
 * destructive action, and giving it a permanent button at the top of every
 * visit cost more space than it earned.
 */
export function PortalHeader({ user }: { user: CurrentUser }) {
  const name = user.displayName?.trim() || user.username;

  return (
    <header className="mb-6 flex items-center justify-between gap-3">
      <h1 className="truncate text-xl font-semibold text-slate-100 sm:text-2xl">
        {greeting()}, {name}
      </h1>

      <nav aria-label="Account" className="flex shrink-0 items-center gap-1">
        {user.isAdmin ? (
          <Link
            href="/admin"
            title="Admin"
            aria-label="Admin"
            className="rounded-md p-2 text-slate-400 transition-colors hover:bg-surface-hover hover:text-slate-200"
          >
            <ShieldCheck aria-hidden="true" className="h-5 w-5" />
          </Link>
        ) : null}

        <Link
          href="/account"
          title="Your account"
          aria-label="Your account"
          className="rounded-md p-2 text-slate-400 transition-colors hover:bg-surface-hover hover:text-slate-200"
        >
          <Settings aria-hidden="true" className="h-5 w-5" />
        </Link>
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
