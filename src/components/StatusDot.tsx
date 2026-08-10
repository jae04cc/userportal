import { cn } from "@/lib/utils";
import type { MonitorHealth, ServiceStatus } from "@/lib/status/types";

const STYLES: Record<ServiceStatus, { dot: string; label: string }> = {
  up: { dot: "bg-status-up", label: "Up" },
  down: { dot: "bg-status-down", label: "Down" },
  degraded: { dot: "bg-status-degraded", label: "Degraded" },
  unknown: { dot: "bg-status-unknown", label: "Unknown" },
};

/** "99.8%" — only shown when the source actually reported an uptime figure. */
function formatUptime(uptime24h: number | null): string | null {
  if (uptime24h === null) return null;
  const pct = uptime24h * 100;
  // Avoid showing a bare "100%" for something that's actually 99.96%.
  return `${pct >= 99.95 && pct < 100 ? "99.9" : pct.toFixed(pct < 100 ? 1 : 0)}%`;
}

/**
 * Status is never conveyed by colour alone — the dot is paired with a text
 * label, and the card's accessible name includes the status too.
 */
export function StatusDot({ health, className }: { health: MonitorHealth; className?: string }) {
  const style = STYLES[health.status] ?? STYLES.unknown;
  const uptime = formatUptime(health.uptime24h);

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-slate-400", className)}>
      <span
        aria-hidden="true"
        className={cn("h-2 w-2 shrink-0 rounded-full transition-colors", style.dot)}
      />
      {style.label}
      {uptime ? (
        <span className="hidden text-slate-600 sm:inline" title="Uptime over the last 24 hours">
          {uptime}
        </span>
      ) : null}
    </span>
  );
}
