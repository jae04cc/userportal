import { requireUser } from "@/lib/authz";
import { getVisibleServices, getMotd } from "@/lib/services";
import { getVisibleStatusItems } from "@/lib/statusPane";
import {
  getKumaConfig,
  getSetting,
  getServiceCardLayouts,
  getStatusPaneColumns,
  SETTING_KEYS,
} from "@/lib/settings";
import { Motd } from "@/components/Motd";
import { Markdown } from "@/components/Markdown";
import { PortalHeader } from "@/components/PortalHeader";
import { LiveArea } from "@/components/LiveArea";
import { type ClientCategory } from "@/components/ServiceGrid";
import { ServiceIcon } from "@/components/ServiceIcon";
import { cardStyle } from "@/components/cardStyles";

// Group membership and admin edits must show up immediately, so this page is
// never statically cached.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser();

  // All of these hit local SQLite and are fast. Uptime Kuma is deliberately NOT
  // awaited here — the pane and grid must paint immediately and let status fill
  // in client-side, rather than blocking first paint on a possibly-slow upstream.
  const [categories, motd, paneItems, kuma, showPingSetting, paneColumns, cardLayouts] =
    await Promise.all([
      getVisibleServices(user),
      getMotd(),
      getVisibleStatusItems(user),
      getKumaConfig(),
      getSetting(SETTING_KEYS.statusPaneShowPing),
      getStatusPaneColumns(),
      getServiceCardLayouts(),
    ]);

  // Icon sizing is part of the layout pair, so it can differ per breakpoint.
  const iconSize = cardStyle(cardLayouts).icon;

  const clientCategories: ClientCategory[] = categories.map((category) => ({
    id: category.id,
    name: category.name,
    services: category.services.map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      // Rendered here on the server so lucide's icon barrel never reaches the
      // client bundle — the browser receives only the resulting <svg>.
      icon: <ServiceIcon icon={service.icon} className={iconSize} />,
      kind: service.kind,
      url: service.url,
      // Likewise for markdown: popup bodies are rendered server-side and handed
      // to the modal as a finished element, keeping react-markdown off the client.
      content:
        service.kind === "popup" && service.content?.trim() ? (
          <Markdown>{service.content}</Markdown>
        ) : null,
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
        cardLayouts={cardLayouts}
        motd={<Motd markdown={motd} />}
      />
    </main>
  );
}
