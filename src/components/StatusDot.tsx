import { cn } from "@/lib/utils";
import type { MonitorHealth, ServiceStatus } from "@/lib/status/types";

const DOT: Record<ServiceStatus, string> = {
  up: "bg-status-up",
  down: "bg-status-down",
  degraded: "bg-status-degraded",
  unknown: "bg-status-unknown",
};

const WORD: Record<ServiceStatus, string> = {
  up: "Up",
  down: "Down",
  degraded: "Degraded",
  unknown: "Unknown",
};

/**
 * A bare status dot for service cards — no visible word, by design.
 *
 * The state is still carried non-visually: the card's accessible name includes
 * it, and `title` surfaces it on hover. Note this does mean colour is the only
 * *visual* channel here, unlike the status pane, which uses distinct glyph
 * shapes because it has no other label.
 */
export function StatusDot({ health, className }: { health: MonitorHealth; className?: string }) {
  const word = WORD[health.status] ?? WORD.unknown;

  return (
    <span
      title={word}
      className={cn("block h-2 w-2 rounded-full transition-colors", DOT[health.status] ?? DOT.unknown, className)}
    >
      <span className="sr-only">{word}</span>
    </span>
  );
}
