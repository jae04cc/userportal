import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { groups } from "@/lib/db/schema";
import { getBranding } from "@/lib/settings";
import { Button, Panel } from "@/components/admin/ui";
import { PortalBanner } from "@/components/PortalBanner";
import { PortalBody } from "@/components/PortalBody";

export const dynamic = "force-dynamic";

/**
 * Renders the landing page as a chosen set of groups would see it.
 *
 * The viewer is always `isAdmin: false`. That is the point of the tool — an
 * admin sees everything, so previewing as one would show nothing useful — and it
 * also means this page can never widen what is displayed beyond what a real
 * member of those groups would get.
 *
 * It renders through PortalBody, the same component the real landing page uses,
 * so the preview cannot drift from the thing it claims to be previewing.
 */
export default async function AdminPreviewPage({
  searchParams,
}: {
  searchParams: { group?: string | string[] };
}) {
  const allGroups = await db.select().from(groups).orderBy(asc(groups.sortOrder), asc(groups.name));

  const requested = Array.isArray(searchParams.group)
    ? searchParams.group
    : searchParams.group
      ? [searchParams.group]
      : [];

  // Only ids that still exist — a stale link shouldn't silently preview as a
  // group that has since been deleted.
  const known = new Set(allGroups.map((g) => g.id));
  const groupIds = requested.filter((id) => known.has(id));

  const selectedNames = allGroups.filter((g) => groupIds.includes(g.id)).map((g) => g.name);
  const branding = await getBranding();

  return (
    <>
      <Panel
        title="Preview as a group"
        description="See the portal exactly as a signed-in member of these groups would. Admins see everything, so this always previews as a non-admin."
      >
        <form method="GET" className="space-y-3">
          {allGroups.length === 0 ? (
            <p className="text-sm text-slate-500">
              No groups exist yet. The preview below shows what someone with no group membership
              sees.
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {allGroups.map((g) => (
                <label key={g.id} className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    name="group"
                    value={g.id}
                    defaultChecked={groupIds.includes(g.id)}
                    className="h-4 w-4"
                  />
                  {g.name}
                </label>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary">
              Update preview
            </Button>
            <span className="text-xs text-slate-600">
              Tick nothing to see what a user with no groups gets — the baseline everyone shares.
            </span>
          </div>
        </form>
      </Panel>

      <section aria-label="Portal preview">
        <div
          role="status"
          className="mb-3 rounded-t-lg border border-b-0 border-sky-900 bg-sky-950/40 px-4 py-2 text-sm text-sky-200"
        >
          Previewing as a non-admin{" "}
          {selectedNames.length > 0 ? (
            <>
              in <strong>{selectedNames.join(", ")}</strong>
            </>
          ) : (
            <>with <strong>no groups</strong></>
          )}
          . Links are live — they go to the real services.
        </div>

        {/* Framed so it reads as an embedded view of another page rather than
            as the admin page itself having changed. */}
        <div className="rounded-b-lg border border-surface-border bg-surface-base p-4 sm:p-6">
          <PortalBanner src={branding.banner} height={branding.bannerHeight} />
          <PortalBody viewer={{ isAdmin: false, groupIds }} />
        </div>
      </section>
    </>
  );
}
