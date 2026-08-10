import { db } from "@/lib/db";
import { services } from "@/lib/db/schema";
import { Panel } from "@/components/admin/ui";
import { KumaSettingsForm } from "@/components/admin/KumaSettingsForm";
import { KumaImport } from "@/components/admin/KumaImport";
import { getKumaConfig } from "@/lib/settings";
import { discoverMonitors } from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function AdminMonitoringPage() {
  const config = await getKumaConfig();

  // Only reach out to Kuma once it's actually configured, and never let a failed
  // discovery break this page — the settings form must stay usable so a bad URL
  // can be corrected.
  const [monitors, existingServices] = await Promise.all([
    config.configured ? discoverMonitors() : Promise.resolve([]),
    db.select().from(services),
  ]);

  const boundKeys = existingServices
    .map((s) => s.monitorKey)
    .filter((k): k is string => Boolean(k));

  return (
    <>
      <Panel
        title="Uptime Kuma connection"
        description="Where the portal reads live service status from. Changes take effect immediately."
      >
        <KumaSettingsForm
          baseUrl={config.baseUrl}
          slug={config.slug}
          showUptime={config.showUptime}
        />
      </Panel>

      <Panel
        title="Import monitors"
        description="Bring the monitors from your Kuma status page in as portal services."
      >
        {config.configured ? (
          <KumaImport monitors={monitors} boundKeys={boundKeys} />
        ) : (
          <p className="text-sm text-slate-500">
            Configure the connection above first, then this will list everything on your status page.
          </p>
        )}
      </Panel>
    </>
  );
}
