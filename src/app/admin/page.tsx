import { getMotd } from "@/lib/services";
import { MotdEditor } from "@/components/admin/MotdEditor";
import { Panel } from "@/components/admin/ui";
import { getKumaConfig } from "@/lib/settings";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminMotdPage() {
  const [motd, kuma] = await Promise.all([getMotd(), getKumaConfig()]);

  return (
    <>
      <Panel
        title="Message of the day"
        description="Shown at the top of every user's landing page. Saves take effect immediately."
      >
        <MotdEditor initial={motd} />
      </Panel>

      {!kuma.configured ? (
        <Panel
          title="Uptime monitoring not configured"
          description="Service cards will show no status until this is set."
        >
          <p className="text-sm text-slate-400">
            Point the portal at a <em>published</em> Uptime Kuma status page on the{" "}
            <Link href="/admin/monitoring" className="text-sky-400 underline">
              Monitoring tab
            </Link>
            . From there you can also import its monitors straight in as services.
          </p>
        </Panel>
      ) : null}
    </>
  );
}
