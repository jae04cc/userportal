import Link from "next/link";
import { requireAdmin } from "@/lib/authz";

// Admin data must never be cached or statically rendered.
export const dynamic = "force-dynamic";

const TABS = [
  { href: "/admin", label: "MOTD" },
  { href: "/admin/services", label: "Services" },
  { href: "/admin/monitoring", label: "Monitoring" },
  { href: "/admin/authentication", label: "Authentication" },
  { href: "/admin/groups", label: "Groups" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/audit", label: "Audit log" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // The server-side gate for the entire /admin subtree. Every action called from
  // these pages re-checks independently — this is defence in depth, not the only
  // line of defence.
  await requireAdmin();

  return (
    <main id="main" className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-100 sm:text-2xl">Admin</h1>
        <Link
          href="/"
          className="rounded-md border border-surface-border px-3 py-1.5 text-sm text-slate-300 transition-colors hover:bg-surface-hover"
        >
          Back to portal
        </Link>
      </div>

      <nav aria-label="Admin sections" className="mb-8 flex flex-wrap gap-2 text-sm">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="rounded-md border border-surface-border px-3 py-1.5 text-slate-300 transition-colors hover:bg-surface-hover"
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {children}
    </main>
  );
}
