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

function beatTitle(beat: Beat): string {
  const when = beat.at ? new Date(beat.at).toLocaleTimeString() : "unknown time";
  const ping = beat.ping !== null ? ` · ${Math.round(beat.ping)}ms` : "";
  return `${when} — ${STATUS_WORD[beat.status]}${ping}`;
}

/**
 * A strip of thin bars, one per recent check, coloured by state.
 *
 * Not a magnitude chart — every bar is full height, because the value being
 * encoded is a state, not a quantity. Separation comes from a 2px surface gap
 * between bars rather than a stroke around each one.
 *
 * Individual bars aren't focusable: forty tab stops per tile would wreck
 * keyboard navigation for no gain. The strip carries one accessible summary
 * instead, and per-beat detail is supplementary (title tooltip) — the current
 * state and uptime are always readable as text on the tile.
 */
export function HeartbeatStrip({ history, label }: { history: Beat[]; label: string }) {
  // Left-pad so a monitor with little history still fills the strip and tiles
  // never change width as data arrives.
  const padding = Math.max(0, HISTORY_LENGTH - history.length);
  const oldest = history.find((b) => b.at !== null)?.at ?? null;
  const span = oldest
    ? `${Math.max(1, Math.round((Date.now() - oldest) / 60000))} min`
    : "recent checks";

  const downCount = history.filter((b) => b.status === "down").length;

  return (
    <div
      role="img"
      aria-label={
        history.length === 0
          ? `${label}: no check history available`
          : `${label}: last ${history.length} checks over ${span}, ${downCount} failed`
      }
      // gap-[2px] is the surface gap that separates touching bars.
      className="flex h-6 items-stretch gap-[2px] overflow-hidden"
    >
      {Array.from({ length: padding }).map((_, i) => (
        <span
          key={`pad-${i}`}
          aria-hidden="true"
          className={cn(
            "min-w-0 flex-1 rounded-[2px] bg-status-unknown/15",
            // Hide the oldest beats first on narrow screens so bars stay legible
            // rather than shrinking to slivers.
            i < HISTORY_LENGTH / 2 && "hidden sm:block"
          )}
        />
      ))}

      {history.map((beat, i) => {
        const index = padding + i;
        return (
          <span
            key={beat.at ?? `beat-${i}`}
            title={beatTitle(beat)}
            aria-hidden="true"
            className={cn(
              "min-w-0 flex-1 rounded-[2px] transition-colors",
              BAR_COLOR[beat.status] ?? BAR_COLOR.unknown,
              index < HISTORY_LENGTH / 2 && "hidden sm:block"
            )}
          />
        );
      })}
    </div>
  );
}
