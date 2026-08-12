"use client";

import { useState } from "react";
import { HeartbeatStrip } from "./HeartbeatStrip";
import { UNKNOWN, type MonitorHealth, type ServiceStatus } from "@/lib/status/types";
import { cn } from "@/lib/utils";

export type ClientStatusItem = { id: string; label: string };

const DOT: Record<ServiceStatus, string> = {
  up: "text-status-up",
  down: "text-status-down",
  degraded: "text-status-degraded",
  maintenance: "text-status-maintenance",
  unknown: "text-status-unknown",
};

const WORD: Record<ServiceStatus, string> = {
  up: "Up",
  down: "Down",
  degraded: "Degraded",
  maintenance: "Maintenance",
  unknown: "Unknown",
};

/** Distinct shapes, so the inline layout never leans on colour alone. */
const GLYPH: Record<ServiceStatus, string> = {
  up: "●",
  degraded: "▲",
  maintenance: "◆",
  down: "✕",
  unknown: "?",
};

const COLUMN_CLASS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
};

/**
 * What the collapsed tiles are hiding, if anything.
 *
 * Collapsing a status pane risks hiding the one tile that matters, so the toggle
 * has to say when a fault is folded away. Reordering to pull problems into view
 * would be the alternative, but that silently overrides the tile order an admin
 * arranged deliberately.
 *
 * "unknown" is not counted: it means no data, not a fault, and a Kuma outage
 * would otherwise flag every hidden tile at once. Maintenance is planned, so it
 * isn't counted either.
 */
function describeHidden(
  items: ClientStatusItem[],
  statuses: Record<string, MonitorHealth>
): { text: string; className: string } | null {
  let down = 0;
  let degraded = 0;
  for (const item of items) {
    const status = (statuses[item.id] ?? UNKNOWN).status;
    if (status === "down") down += 1;
    else if (status === "degraded") degraded += 1;
  }

  if (down > 0) return { text: `${down} down`, className: DOT.down };
  if (degraded > 0) return { text: `${degraded} degraded`, className: DOT.degraded };
  return null;
}

/** "99.8%" — never a bare "100%" for something that is actually 99.96%. */
function formatUptime(uptime24h: number | null): string | null {
  if (uptime24h === null) return null;
  const pct = uptime24h * 100;
  return `${pct >= 99.95 && pct < 100 ? "99.9" : pct.toFixed(pct < 100 ? 1 : 0)}%`;
}

/**
 * A glanceable strip above the message of the day — deliberately subordinate to
 * the MOTD and the service cards below it.
 *
 * Two layouts:
 *  - one column: everything on a single row, with a status glyph, since a
 *    full-width strip there would be absurdly long.
 *  - two or three columns: label on top, strip beneath at full tile width. The
 *    rightmost bar IS the current status, so there's no separate indicator —
 *    it would just restate the graph.
 */
export function StatusPane({
  items,
  statuses,
  showPing,
  columns,
  collapseAfter,
}: {
  items: ClientStatusItem[];
  statuses: Record<string, MonitorHealth>;
  showPing: boolean;
  columns: number;
  /** Tiles kept visible before the rest fold away. 0 disables collapsing. */
  collapseAfter: number;
}) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) return null;

  const stacked = columns >= 2;

  // Collapsing only earns its keep when it actually hides something: with
  // exactly one tile over the limit, the toggle costs as much room as the tile.
  const collapsible = collapseAfter > 0 && items.length > collapseAfter + 1;
  const hidden = collapsible && !expanded ? items.slice(collapseAfter) : [];
  const visible = hidden.length > 0 ? items.slice(0, collapseAfter) : items;
  const problems = describeHidden(hidden, statuses);

  return (
    <section aria-labelledby="status-pane-heading" className="mb-6">
      <h2 id="status-pane-heading" className="sr-only">
        Service status
      </h2>

      <div
        id="status-pane-tiles"
        className={cn("grid gap-x-2 gap-y-1", COLUMN_CLASS[columns] ?? COLUMN_CLASS[2])}
      >
        {visible.map((item) => {
          const health = statuses[item.id] ?? UNKNOWN;
          const uptime = formatUptime(health.uptime24h);
          const word = WORD[health.status] ?? WORD.unknown;
          const healthy = health.status === "up";

          const figures = (
            <>
              {/* Only named when something is wrong. A healthy tile stays clean;
                  a problem never relies on colour alone to announce itself. */}
              {!healthy ? (
                <span className={cn("font-medium", DOT[health.status] ?? DOT.unknown)}>{word}</span>
              ) : null}
              {uptime ? (
                <span className="hidden sm:inline" title="Uptime over the last 24 hours">
                  {uptime}
                </span>
              ) : null}
              {showPing && health.ping !== null ? (
                <span className="hidden lg:inline" title="Most recent response time">
                  {Math.round(health.ping)}ms
                </span>
              ) : null}
            </>
          );

          if (stacked) {
            return (
              <div
                key={item.id}
                className="rounded-md border border-surface-border bg-surface-raised px-2.5 py-1.5"
              >
                <div className="mb-1 flex items-baseline gap-2">
                  <span className="min-w-0 truncate text-xs font-medium text-slate-200">
                    {item.label}
                  </span>
                  <span className="ml-auto flex shrink-0 items-baseline gap-2 text-[11px] tabular-nums text-slate-500">
                    {figures}
                  </span>
                </div>
                <span className="sr-only">{word}</span>
                <HeartbeatStrip history={health.history} label={item.label} variant="stacked" />
              </div>
            );
          }

          return (
            <div
              key={item.id}
              className="flex items-center gap-2.5 rounded-md border border-surface-border bg-surface-raised px-2.5 py-1.5"
            >
              <span
                aria-hidden="true"
                className={cn("shrink-0 text-[9px] leading-none", DOT[health.status] ?? DOT.unknown)}
              >
                {GLYPH[health.status] ?? GLYPH.unknown}
              </span>
              <span className="sr-only">{word}</span>

              <span className="min-w-0 shrink truncate text-xs font-medium text-slate-200">
                {item.label}
              </span>

              <span className="ml-auto w-24 shrink-0 sm:w-32 lg:w-40">
                <HeartbeatStrip history={health.history} label={item.label} variant="inline" />
              </span>

              <span className="flex shrink-0 items-baseline gap-2 text-[11px] tabular-nums text-slate-500">
                {figures}
              </span>
            </div>
          );
        })}
      </div>

      {collapsible ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls="status-pane-tiles"
          className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-md border border-surface-border bg-surface-raised px-2.5 py-1 text-[11px] text-slate-400 transition-colors hover:bg-surface-hover hover:text-slate-200"
        >
          <span>{expanded ? "Show fewer" : `Show ${items.length - collapseAfter} more`}</span>

          {/* Named as well as coloured — a fault folded out of sight must not be
              announced by colour alone. */}
          {problems ? (
            <span className={cn("font-medium", problems.className)}>· {problems.text}</span>
          ) : null}

          {/* Inline rather than a lucide import: this is a client component, and
              one chevron isn't worth the icon library crossing into the bundle. */}
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      ) : null}
    </section>
  );
}
