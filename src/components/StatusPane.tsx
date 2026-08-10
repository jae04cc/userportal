"use client";

import { HeartbeatStrip } from "./HeartbeatStrip";
import { UNKNOWN, type MonitorHealth, type ServiceStatus } from "@/lib/status/types";
import { cn } from "@/lib/utils";

export type ClientStatusItem = { id: string; label: string };

const DOT: Record<ServiceStatus, string> = {
  up: "text-status-up",
  down: "text-status-down",
  degraded: "text-status-degraded",
  unknown: "text-status-unknown",
};

const WORD: Record<ServiceStatus, string> = {
  up: "Up",
  down: "Down",
  degraded: "Degraded",
  unknown: "Unknown",
};

/**
 * Distinct SHAPES, not just distinct colours. At narrow widths there's no room
 * for the status word, and colour alone must never carry the meaning — so the
 * glyph is the channel that's always present.
 */
const GLYPH: Record<ServiceStatus, string> = {
  up: "●",
  degraded: "▲",
  down: "✕",
  unknown: "?",
};

/**
 * The column count is honoured at every width, including phones — picking 3
 * and getting 1 on mobile is the bug this replaces. Density is handled by
 * dropping tile *contents* as columns get narrower, not by overriding the
 * choice. Tailwind needs static class names, hence the lookup.
 */
const LAYOUT: Record<
  number,
  { grid: string; strip: string; word: string; uptime: string; ping: string }
> = {
  1: {
    grid: "grid-cols-1",
    strip: "w-24 sm:w-32 lg:w-40",
    word: "inline",
    uptime: "inline",
    ping: "hidden sm:inline",
  },
  2: {
    grid: "grid-cols-2",
    strip: "w-12 sm:w-24 lg:w-32",
    word: "hidden sm:inline",
    uptime: "hidden md:inline",
    ping: "hidden lg:inline",
  },
  3: {
    grid: "grid-cols-3",
    strip: "w-8 sm:w-16 lg:w-24",
    word: "hidden lg:inline",
    uptime: "hidden lg:inline",
    ping: "hidden xl:inline",
  },
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
 * Each tile is a single row: status glyph, label, heartbeat strip, figures.
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

  const layout = LAYOUT[columns] ?? LAYOUT[2];

  return (
    <section aria-labelledby="status-pane-heading" className="mb-6">
      <h2 id="status-pane-heading" className="sr-only">
        Service status
      </h2>

      <div className={cn("grid gap-x-2 gap-y-1", layout.grid)}>
        {items.map((item) => {
          const health = statuses[item.id] ?? UNKNOWN;
          const uptime = formatUptime(health.uptime24h);
          const word = WORD[health.status] ?? WORD.unknown;

          return (
            <div
              key={item.id}
              className="flex items-center gap-1.5 rounded-md border border-surface-border bg-surface-raised px-2 py-1.5 sm:gap-2.5 sm:px-2.5"
            >
              {/* Shape + colour. The sr-only word keeps the state readable even
                  when the visible label is dropped for width. */}
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

              <span className={cn("ml-auto shrink-0", layout.strip)}>
                <HeartbeatStrip history={health.history} label={item.label} />
              </span>

              {/* Figures sit in text tokens, never the status colour. */}
              <span className="flex shrink-0 items-center gap-2 text-[11px] tabular-nums text-slate-500">
                <span className={cn("text-right text-slate-400", layout.word)}>{word}</span>
                {uptime ? (
                  <span className={cn("text-right", layout.uptime)} title="Uptime over the last 24 hours">
                    {uptime}
                  </span>
                ) : null}
                {showPing && health.ping !== null ? (
                  <span className={cn("text-right", layout.ping)} title="Most recent response time">
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
