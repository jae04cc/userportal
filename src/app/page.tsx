import { requireUser } from "@/lib/authz";
import { getVisibleServices, getMotd } from "@/lib/services";
import { getVisibleStatusItems } from "@/lib/statusPane";
import { getKumaConfig, getSetting, getStatusPaneColumns, SETTING_KEYS } from "@/lib/settings";
import { Motd } from "@/components/Motd";
import { PortalHeader } from "@/components/PortalHeader";
import { LiveArea } from "@/components/LiveArea";
import { type ClientCategory } from "@/components/ServiceGrid";
import { ServiceIcon } from "@/components/ServiceIcon";

// Group membership and admin edits must show up immediately, so this page is
// never statically cached.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser();

  // All of these hit local SQLite and are fast. Uptime Kuma is deliberately NOT
  // awaited here — the pane and grid must paint immediately and let status fill
  // in client-side, rather than blocking first paint on a possibly-slow upstream.
  const [categories, motd, paneItems, kuma, showPingSetting, paneColumns] = await Promise.all([
    getVisibleServices(user),
    getMotd(),
    getVisibleStatusItems(user),
    getKumaConfig(),
    getSetting(SETTING_KEYS.statusPaneShowPing),
    getStatusPaneColumns(),
  ]);

  const clientCategories: ClientCategory[] = categories.map((category) => ({
    id: category.id,
    name: category.name,
    services: category.services.map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      // Rendered here on the server so lucide's icon barrel never reaches the
      // client bundle — the browser receives only the resulting <svg>.
      icon: <ServiceIcon icon={service.icon} />,
      url: service.url,
      // monitorKey itself is intentionally not serialised to the browser.
      hasMonitor: Boolean(service.monitorKey),
    })),
  }));

  return (
    <main id="main" className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <PortalHeader user={user} />

      {user.mustChangePassword ? (
        <p
          role="alert"
          className="mb-6 rounded-lg border border-amber-900 bg-amber-950/40 px-4 py-3 text-sm text-amber-300"
        >
          This account still uses the generated bootstrap password, which is sitting in the server
          log.{" "}
          <a href="/account" className="font-medium underline">
            Change it now
          </a>
          .
        </p>
      ) : null}

      <LiveArea
        paneItems={paneItems.map((item) => ({ id: item.id, label: item.label }))}
        categories={clientCategories}
        showPing={kuma.configured && showPingSetting !== "false"}
        paneColumns={paneColumns}
        motd={<Motd markdown={motd} />}
      />
    </main>
  );
}
