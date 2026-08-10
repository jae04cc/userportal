import { listAudit } from "@/lib/audit";
import { Panel } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  const entries = await listAudit(200);

  return (
    <Panel title="Audit log" description="Every change made from the admin area, newest first.">
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing recorded yet.</p>
      ) : (
        <div>
          {/* Scrollbars are hidden globally, so this table's horizontal scroll
              needs a cue of its own on narrow screens. */}
          <p className="mb-2 text-xs text-slate-600 sm:hidden">Swipe sideways to see more.</p>
          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-xs uppercase tracking-wider text-slate-500">
                <th scope="col" className="py-2 pr-3 font-medium">
                  When
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Who
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  What
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-surface-border/50 align-top">
                  <td className="whitespace-nowrap py-2 pr-3 text-slate-500">
                    {new Date(entry.createdAt).toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-slate-300">
                    {entry.actorUsername}
                  </td>
                  <td className="py-2 pr-3 text-slate-300">{entry.summary}</td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </div>
      )}
    </Panel>
  );
}
