import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { getVisibleServices } from "@/lib/services";
import { getStatuses, UNKNOWN, type MonitorHealth } from "@/lib/status";
import { getKumaConfig } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * Returns health for exactly the services this user is allowed to see.
 *
 * Two deliberate properties:
 *  - It reuses getVisibleServices, so it can't leak an admin-only service's
 *    existence to a normal user.
 *  - It keys by service id, never by Kuma monitor id or name, so the browser
 *    learns nothing about the monitoring topology.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const [visible, statuses, config] = await Promise.all([
    getVisibleServices(user),
    getStatuses(),
    getKumaConfig(),
  ]);

  const result: Record<string, MonitorHealth> = {};
  for (const category of visible) {
    for (const service of category.services) {
      if (!service.monitorKey) continue;
      const health = statuses.get(service.monitorKey) ?? UNKNOWN;
      result[service.id] = config.showUptime ? health : { ...health, uptime24h: null };
    }
  }

  return NextResponse.json(
    { statuses: result, checkedAt: Date.now() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
