"use client";

import { HeartbeatStrip } from "./HeartbeatStrip";
import { UNKNOWN, type MonitorHealth, type ServiceStatus } from "@/lib/status/types";
import { cn } from "@/lib/utils";

export type ClientStatusItem = { id: string; label: string };

const DOT: Record<ServiceStatus, string> = {
  up: "bg-status-up",
  down: "bg-status-down",
  degraded: "bg-status-degraded",
  unknown: "bg-status-unknown",
};

const LABEL: Record<ServiceStatus, string> = {
  up: "Up",
  down: "Down",
  degraded: "Degraded",
  unknown: "Unknown",
};

// Static class names — Tailwind can't see dynamically built ones.
const COLUMN_CLASS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
};

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
 * Each tile is a single row: state dot, label, heartbeat strip, figures. Keeping
 * it to one line is what stops the pane dominating a page whose real content is
 * further down.
 *
 * State is never colour-alone — the word sits beside the dot on every tile.
 */
export function StatusPane({
  items,
  statuses,
  showPing,
  columns,
}: {
  items: ClientStatusItem[];
  statuses: Record<string, MonitorHealth>;
  showPing: boolean;
  columns: number;
}) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="status-pane-heading" className="mb-6">
      <h2 id="status-pane-heading" className="sr-only">
        Service status
      </h2>

      <div className={cn("grid gap-x-3 gap-y-1", COLUMN_CLASS[columns] ?? COLUMN_CLASS[2])}>
        {items.map((item) => {
          const health = statuses[item.id] ?? UNKNOWN;
          const uptime = formatUptime(health.uptime24h);

          return (
            <div
              key={item.id}
              className="flex items-center gap-2.5 rounded-md border border-surface-border bg-surface-raised px-2.5 py-1.5"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full transition-colors",
                  DOT[health.status] ?? DOT.unknown
                )}
              />

              <span className="min-w-0 shrink truncate text-xs font-medium text-slate-200">
                {item.label}
              </span>

              {/* The strip takes the slack, so tiles line up across columns. */}
              <span className="ml-auto w-16 shrink-0 sm:w-24 lg:w-32">
                <HeartbeatStrip history={health.history} label={item.label} />
              </span>

              {/* Figures sit in text tokens, never the status colour. */}
              <span className="flex shrink-0 items-center gap-2 text-[11px] tabular-nums text-slate-500">
                <span className="w-9 text-right text-slate-400">
                  {LABEL[health.status] ?? LABEL.unknown}
                </span>
                {uptime ? (
                  <span className="hidden w-11 text-right sm:inline" title="Uptime over the last 24 hours">
                    {uptime}
                  </span>
                ) : null}
                {showPing && health.ping !== null ? (
                  <span className="hidden w-12 text-right lg:inline" title="Most recent response time">
                    {Math.round(health.ping)}ms
                  </span>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
