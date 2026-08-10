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

/** "99.8%" — never a bare "100%" for something that is actually 99.96%. */
function formatUptime(uptime24h: number | null): string | null {
  if (uptime24h === null) return null;
  const pct = uptime24h * 100;
  return `${pct >= 99.95 && pct < 100 ? "99.9" : pct.toFixed(pct < 100 ? 1 : 0)}%`;
}

/**
 * The slim pane above the message of the day.
 *
 * Each tile is a stat tile in the conventional sense — label, value, trend —
 * where the "value" is the current state and the trend is the heartbeat strip.
 * State is never colour-alone: every tile carries the word next to the dot.
 */
export function StatusPane({
  items,
  statuses,
  showPing,
}: {
  items: ClientStatusItem[];
  statuses: Record<string, MonitorHealth>;
  showPing: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="status-pane-heading" className="mb-6">
      <h2 id="status-pane-heading" className="sr-only">
        Service status
      </h2>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const health = statuses[item.id] ?? UNKNOWN;
          const uptime = formatUptime(health.uptime24h);

          return (
            <div
              key={item.id}
              className="rounded-lg border border-surface-border bg-surface-raised px-3 py-2.5"
            >
              <div className="mb-2 flex items-baseline gap-2">
                <span className="truncate text-sm font-medium text-slate-200">{item.label}</span>

                <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-slate-400">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full transition-colors",
                      DOT[health.status] ?? DOT.unknown
                    )}
                  />
                  {LABEL[health.status] ?? LABEL.unknown}
                </span>
              </div>

              <HeartbeatStrip history={health.history} label={item.label} />

              {/* Values sit in text tokens, never the status colour. */}
              <div className="mt-1.5 flex items-center gap-3 text-[11px] tabular-nums text-slate-500">
                {uptime ? <span title="Uptime over the last 24 hours">{uptime} uptime</span> : null}
                {showPing && health.ping !== null ? (
                  <span title="Most recent response time">{Math.round(health.ping)}ms</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
