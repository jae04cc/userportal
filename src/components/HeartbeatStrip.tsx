"use client";

import { cn } from "@/lib/utils";
import { HISTORY_LENGTH, type Beat, type ServiceStatus } from "@/lib/status/types";

const BAR_COLOR: Record<ServiceStatus, string> = {
  up: "bg-status-up",
  down: "bg-status-down",
  degraded: "bg-status-degraded",
  unknown: "bg-status-unknown/40",
};

const STATUS_WORD: Record<ServiceStatus, string> = {
  up: "up",
  down: "down",
  degraded: "degraded",
  unknown: "no data",
};

// How many of the most recent beats are visible at each width. Narrow columns
// get fewer bars rather than thinner ones — a 1px sliver reads as noise.
const SHOW_BASE = 12;
const SHOW_SM = 24;

function beatTitle(beat: Beat): string {
  const when = beat.at ? new Date(beat.at).toLocaleTimeString() : "unknown time";
  const ping = beat.ping !== null ? ` · ${Math.round(beat.ping)}ms` : "";
  return `${when} — ${STATUS_WORD[beat.status]}${ping}`;
}

/**
 * A strip of thin bars, one per recent check, coloured by state.
 *
 * Not a magnitude chart — every bar is full height, because what's encoded is a
 * state, not a quantity. Separation comes from a 2px surface gap rather than a
 * stroke around each bar.
 *
 * Individual bars aren't focusable: forty tab stops per tile would wreck
 * keyboard navigation for no gain. The strip carries one accessible summary
 * instead, and per-beat detail is supplementary — current state and uptime are
 * always readable as text on the tile itself.
 */
export function HeartbeatStrip({ history, label }: { history: Beat[]; label: string }) {
  // Left-pad so a monitor with little history still fills the strip, and tiles
  // never change width as data arrives.
  const padding = Math.max(0, HISTORY_LENGTH - history.length);
  const oldest = history.find((b) => b.at !== null)?.at ?? null;
  const span = oldest
    ? `${Math.max(1, Math.round((Date.now() - oldest) / 60000))} min`
    : "recent checks";
  const downCount = history.filter((b) => b.status === "down").length;

  /** Hide older beats at narrower widths, counting back from the newest. */
  const visibility = (index: number) => {
    const fromEnd = HISTORY_LENGTH - index;
    return cn(
      fromEnd > SHOW_SM && "hidden lg:block",
      fromEnd > SHOW_BASE && fromEnd <= SHOW_SM && "hidden sm:block"
    );
  };

  return (
    <div
      role="img"
      aria-label={
        history.length === 0
          ? `${label}: no check history available`
          : `${label}: last ${history.length} checks over ${span}, ${downCount} failed`
      }
      // gap-[2px] is the surface gap separating touching bars.
      className="flex h-3 items-stretch gap-[2px] overflow-hidden"
    >
      {Array.from({ length: padding }).map((_, i) => (
        <span
          key={`pad-${i}`}
          aria-hidden="true"
          className={cn(
            "min-w-[2px] flex-1 rounded-[1px] bg-status-unknown/15",
            visibility(i)
          )}
        />
      ))}

      {history.map((beat, i) => (
        <span
          key={beat.at ?? `beat-${i}`}
          title={beatTitle(beat)}
          aria-hidden="true"
          className={cn(
            "min-w-[2px] flex-1 rounded-[1px] transition-colors",
            BAR_COLOR[beat.status] ?? BAR_COLOR.unknown,
            visibility(padding + i)
          )}
        />
      ))}
    </div>
  );
}
