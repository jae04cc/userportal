import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/authz";
import { getVisibleServices } from "@/lib/services";
import { Markdown } from "@/components/Markdown";

export const dynamic = "force-dynamic";

/**
 * Full-page presentation for a "page" card — the alternative to the popup.
 *
 * Access goes through getVisibleServices, the same resolver the landing page
 * and /api/status use, so a user can't read a page belonging to a service they
 * aren't entitled to see just by knowing its id. An unauthorised id is a 404,
 * not a 403 — that way the URL doesn't confirm the service exists.
 */
export default async function InfoPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const categories = await getVisibleServices(user);

  const service = categories
    .flatMap((category) => category.services)
    .find((s) => s.id === params.id);

  if (!service || service.kind !== "page") notFound();

  return (
    <main id="main" className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-100 sm:text-2xl">{service.name}</h1>
          {service.description ? (
            <p className="mt-1 text-sm text-slate-500">{service.description}</p>
          ) : null}
        </div>
        <Link
          href="/"
          className="shrink-0 rounded-md border border-surface-border px-3 py-1.5 text-sm text-slate-300 transition-colors hover:bg-surface-hover"
        >
          Back to portal
        </Link>
      </div>

      {service.content?.trim() ? (
        <Markdown>{service.content}</Markdown>
      ) : (
        <p className="text-sm text-slate-500">This page has no content yet.</p>
      )}
    </main>
  );
}
