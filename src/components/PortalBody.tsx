import { getVisibleServices, getMotd } from "@/lib/services";
import { getVisibleStatusItems } from "@/lib/statusPane";
import {
  getKumaConfig,
  getSetting,
  getServiceCardLayouts,
  getStatusPaneCollapseAfter,
  getStatusPaneColumns,
  SETTING_KEYS,
} from "@/lib/settings";
import type { VisibilityViewer } from "@/lib/visibility";
import { Motd } from "@/components/Motd";
import { Markdown } from "@/components/Markdown";
import { LiveArea } from "@/components/LiveArea";
import { type ClientCategory } from "@/components/ServiceGrid";
import { ServiceIcon } from "@/components/ServiceIcon";
import { cardStyle } from "@/components/cardStyles";

/**
 * Everything below the greeting: the status pane, the message of the day, and
 * the service grid, resolved for one viewer.
 *
 * Extracted so the landing page and the admin preview render through exactly the
 * same code. If the preview rebuilt this itself it would drift, and a preview
 * that quietly disagrees with the real page is worse than no preview at all.
 */
export async function PortalBody({ viewer }: { viewer: VisibilityViewer }) {
  // All of these hit local SQLite and are fast. Uptime Kuma is deliberately NOT
  // awaited here — the pane and grid must paint immediately and let status fill
  // in client-side, rather than blocking first paint on a possibly-slow upstream.
  const [categories, motd, paneItems, kuma, showPingSetting, paneColumns, paneCollapseAfter, cardLayouts] =
    await Promise.all([
      getVisibleServices(viewer),
      getMotd(),
      getVisibleStatusItems(viewer),
      getKumaConfig(),
      getSetting(SETTING_KEYS.statusPaneShowPing),
      getStatusPaneColumns(),
      getStatusPaneCollapseAfter(),
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
    <LiveArea
      paneItems={paneItems.map((item) => ({ id: item.id, label: item.label }))}
      categories={clientCategories}
      showPing={kuma.configured && showPingSetting !== "false"}
      paneColumns={paneColumns}
      paneCollapseAfter={paneCollapseAfter}
      cardLayouts={cardLayouts}
      motd={<Motd markdown={motd} />}
    />
  );
}
