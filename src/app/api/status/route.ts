import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { getVisibleServices } from "@/lib/services";
import { getVisibleStatusItems } from "@/lib/statusPane";
import { getStatuses, UNKNOWN, type MonitorHealth } from "@/lib/status";
import { getKumaConfig } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * Health for exactly the services and status tiles this user is allowed to see.
 *
 * Two deliberate properties, both load-bearing:
 *  - It reuses getVisibleServices / getVisibleStatusItems, so it can't leak the
 *    existence of an admin-only service or tile to a normal user.
 *  - It keys by service/tile id, never by Kuma monitor id or name, so the
 *    browser learns nothing about the monitoring topology.
 *
 * One endpoint serves both the cards and the pane so the page makes a single
 * poll rather than two.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const [visible, paneItems, statuses, config] = await Promise.all([
    getVisibleServices(user),
    getVisibleStatusItems(user),
    getStatuses(),
    getKumaConfig(),
  ]);

  // Cards only need the current state and uptime — the per-beat history would
  // be dead weight on a page with many services.
  const services: Record<string, Omit<MonitorHealth, "history">> = {};
  for (const category of visible) {
    for (const service of category.services) {
      if (!service.monitorKey) continue;
      const { history: _history, ...rest } = statuses.get(service.monitorKey) ?? UNKNOWN;
      services[service.id] = config.showUptime ? rest : { ...rest, uptime24h: null };
    }
  }

  const pane: Record<string, MonitorHealth> = {};
  for (const item of paneItems) {
    pane[item.id] = statuses.get(item.monitorKey) ?? UNKNOWN;
  }

  return NextResponse.json(
    { statuses: services, pane, checkedAt: Date.now() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
