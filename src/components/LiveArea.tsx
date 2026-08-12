"use client";

import type { ReactNode } from "react";
import { StatusPane, type ClientStatusItem } from "./StatusPane";
import { ServiceGrid, type ClientCategory } from "./ServiceGrid";
import type { CardLayouts } from "./cardStyles";
import { useServiceStatus } from "./useServiceStatus";

/**
 * Owns the single status poll for the whole landing page.
 *
 * The pane and the grid both need live health, so the hook lives here and the
 * data is passed down — two components each calling it would mean two requests
 * every 30 seconds for identical data.
 *
 * `motd` arrives as an already-rendered server element so the markdown renderer
 * stays on the server, out of the client bundle, while still sitting between the
 * pane and the grid in the layout.
 */
export function LiveArea({
  paneItems,
  categories,
  showPing,
  paneColumns,
  paneCollapseAfter,
  cardLayouts,
  motd,
}: {
  paneItems: ClientStatusItem[];
  categories: ClientCategory[];
  showPing: boolean;
  paneColumns: number;
  paneCollapseAfter: number;
  cardLayouts: CardLayouts;
  motd: ReactNode;
}) {
  const { statuses, pane } = useServiceStatus();

  return (
    <>
      <StatusPane
        items={paneItems}
        statuses={pane}
        showPing={showPing}
        columns={paneColumns}
        collapseAfter={paneCollapseAfter}
      />
      {motd}
      <div className="mt-8">
        <ServiceGrid categories={categories} statuses={statuses} layouts={cardLayouts} />
      </div>
    </>
  );
}
