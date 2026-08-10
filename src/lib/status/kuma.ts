import {
  HISTORY_LENGTH,
  type Beat,
  type DiscoveredMonitor,
  type MonitorHealth,
  type ServiceStatus,
  type StatusMap,
  type StatusProvider,
} from "./types";

// ---------------------------------------------------------------------------
// Uptime Kuma has no committed public REST API. The status-page endpoints below
// are what its own frontend uses and are stable in practice, but a Kuma major
// upgrade could change them — hence the StatusProvider seam and the hard rule
// that any failure degrades to "unknown" rather than breaking the portal.
//
//   GET /api/status-page/{slug}            → group + monitor list
//   GET /api/status-page/heartbeat/{slug}  → heartbeats + 24h uptime per monitor
//
// Requires one PUBLISHED status page in Kuma containing the monitors to surface.
// ---------------------------------------------------------------------------

const KUMA_TIMEOUT_MS = 3000;

/** Kuma heartbeat status codes. */
const KUMA_DOWN = 0;
const KUMA_UP = 1;
const KUMA_PENDING = 2;
const KUMA_MAINTENANCE = 3;

type KumaMonitor = { id: number; name: string };
type KumaHeartbeat = { status: number; time: string; ping?: number | null };

export type KumaStatusPageResponse = {
  publicGroupList?: Array<{ name?: string; monitorList?: KumaMonitor[] }>;
};

export type KumaHeartbeatResponse = {
  heartbeatList?: Record<string, KumaHeartbeat[]>;
  uptimeList?: Record<string, number>;
};

/**
 * Maps Kuma's heartbeat code onto the portal's states.
 *
 * Kuma has no native "degraded"; PENDING means failing but still inside its
 * retry budget, which is exactly that. MAINTENANCE is kept separate — a planned
 * window is not a fault, and colouring it as a warning misreports it.
 */
export function mapKumaStatus(code: number): ServiceStatus {
  switch (code) {
    case KUMA_UP:
      return "up";
    case KUMA_DOWN:
      return "down";
    case KUMA_PENDING:
      return "degraded";
    case KUMA_MAINTENANCE:
      return "maintenance";
    default:
      return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Staleness
//
// A heartbeat is "stale" when Kuma has evidently stopped checking — reporting
// the last known state as current would be a lie. But how old is too old
// depends entirely on the monitor's check interval: 15 minutes is alarming for
// a 60-second monitor and completely normal for a 30-minute one.
//
// So the interval is inferred from the spacing of the beats themselves, rather
// than assumed. A fixed threshold marks every long-interval monitor unknown.
// ---------------------------------------------------------------------------

/** Tolerate this many missed checks before calling it stale. */
const STALE_INTERVAL_MULTIPLIER = 2.5;
/** Never call something stale sooner than this, however fast it checks. */
const STALE_FLOOR_MS = 5 * 60_000;
/** However slow the monitor, silence beyond this is stale. */
const STALE_CEILING_MS = 24 * 60 * 60_000;
/** Used when the interval can't be inferred (fewer than two beats). */
const STALE_FALLBACK_MS = 30 * 60_000;

/**
 * Median gap between consecutive beats, in ms. The median rather than the mean
 * so a single outage gap doesn't inflate the estimate.
 */
export function inferIntervalMs(times: number[]): number | null {
  const valid = times.filter((t) => Number.isFinite(t));
  if (valid.length < 2) return null;

  const gaps: number[] = [];
  for (let i = 1; i < valid.length; i += 1) {
    const gap = valid[i] - valid[i - 1];
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) return null;

  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

/** How old the newest beat may be before the monitor counts as stale. */
export function staleThresholdMs(intervalMs: number | null): number {
  if (intervalMs === null) return STALE_FALLBACK_MS;
  const scaled = intervalMs * STALE_INTERVAL_MULTIPLIER;
  return Math.min(Math.max(scaled, STALE_FLOOR_MS), STALE_CEILING_MS);
}

/**
 * Kuma emits naive timestamps ("2026-08-08 12:00:00") in the status page's
 * configured timezone as well as ISO strings depending on version. Parse both,
 * treating a naive string as UTC so a timezone offset can't make a fresh
 * heartbeat look stale.
 */
export function parseKumaTime(value: string): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalised = /[TZ]|[+-]\d{2}:?\d{2}$/.test(value)
    ? value
    : `${value.trim().replace(" ", "T")}Z`;
  const parsed = Date.parse(normalised);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Extracts monitors and their group names, tolerating malformed entries. */
function readMonitors(
  page: KumaStatusPageResponse
): Array<{ id: number; name: string; groupName: string }> {
  const out: Array<{ id: number; name: string; groupName: string }> = [];
  for (const group of page.publicGroupList ?? []) {
    const groupName = typeof group?.name === "string" && group.name.trim() ? group.name : "Services";
    for (const monitor of group?.monitorList ?? []) {
      if (monitor && typeof monitor.id === "number" && typeof monitor.name === "string") {
        out.push({ id: monitor.id, name: monitor.name, groupName });
      }
    }
  }
  return out;
}

/**
 * Pure parser, split out from the fetching so it can be unit tested against
 * captured fixtures. Every monitor is registered under BOTH its id and its
 * name, so either form of binding resolves.
 */
export function parseKumaResponses(
  page: KumaStatusPageResponse,
  heartbeats: KumaHeartbeatResponse,
  now: number = Date.now()
): StatusMap {
  const result: StatusMap = new Map();

  for (const monitor of readMonitors(page)) {
    const key = String(monitor.id);
    const list = heartbeats.heartbeatList?.[key];
    const rawUptime = heartbeats.uptimeList?.[`${key}_24`] ?? heartbeats.uptimeList?.[key];
    const uptime24h = typeof rawUptime === "number" && Number.isFinite(rawUptime) ? rawUptime : null;

    let health: MonitorHealth;

    if (!Array.isArray(list) || list.length === 0) {
      health = { status: "unknown", uptime24h, lastCheckAt: null, ping: null, history: [] };
    } else {
      // Oldest-first, trimmed to the strip length the pane renders.
      const history: Beat[] = list.slice(-HISTORY_LENGTH).map((beat) => ({
        status: typeof beat?.status === "number" ? mapKumaStatus(beat.status) : "unknown",
        ping: typeof beat?.ping === "number" && Number.isFinite(beat.ping) ? beat.ping : null,
        at: beat?.time ? parseKumaTime(beat.time) : null,
      }));

      const latest = list[list.length - 1];
      const lastCheckAt = latest ? parseKumaTime(latest.time) : null;
      const ping =
        typeof latest?.ping === "number" && Number.isFinite(latest.ping) ? latest.ping : null;

      // Scale the staleness window to this monitor's own cadence.
      const interval = inferIntervalMs(history.map((b) => b.at ?? NaN));
      const stale = lastCheckAt !== null && now - lastCheckAt > staleThresholdMs(interval);
      const usable = latest && typeof latest.status === "number" && !stale;

      health = {
        // Kuma having stopped checking is not a real "up" — report unknown.
        status: usable ? mapKumaStatus(latest.status) : "unknown",
        uptime24h,
        lastCheckAt,
        ping: usable ? ping : null,
        history,
      };
    }

    result.set(key, health);
    result.set(monitor.name, health);
  }

  return result;
}

export function parseKumaMonitors(page: KumaStatusPageResponse): DiscoveredMonitor[] {
  return readMonitors(page).map((m) => ({
    id: String(m.id),
    name: m.name,
    groupName: m.groupName,
  }));
}

export class KumaStatusProvider implements StatusProvider {
  readonly name = "uptime-kuma";

  constructor(
    private readonly baseUrl: string,
    private readonly slug: string
  ) {}

  private url(pathname: string): string {
    return `${this.baseUrl.replace(/\/+$/, "")}${pathname}`;
  }

  private async get<T>(pathname: string): Promise<T | null> {
    try {
      const res = await fetch(this.url(pathname), {
        signal: AbortSignal.timeout(KUMA_TIMEOUT_MS),
        cache: "no-store",
      });
      if (!res.ok) {
        console.warn(`[status] Kuma responded ${res.status} for ${pathname}`);
        return null;
      }
      return (await res.json()) as T;
    } catch (err) {
      // Unreachable, DNS failure, timeout, malformed JSON — all the same to the
      // caller. Cards fall back to "unknown"; the portal never errors on this.
      console.warn(`[status] Kuma unreachable: ${(err as Error).message}`);
      return null;
    }
  }

  async fetchStatuses(): Promise<StatusMap> {
    const slug = encodeURIComponent(this.slug);
    const [page, beats] = await Promise.all([
      this.get<KumaStatusPageResponse>(`/api/status-page/${slug}`),
      this.get<KumaHeartbeatResponse>(`/api/status-page/heartbeat/${slug}`),
    ]);
    if (!page || !beats) return new Map();
    return parseKumaResponses(page, beats);
  }

  async discoverMonitors(): Promise<DiscoveredMonitor[]> {
    const page = await this.get<KumaStatusPageResponse>(
      `/api/status-page/${encodeURIComponent(this.slug)}`
    );
    return page ? parseKumaMonitors(page) : [];
  }

  /** Used by the admin "Test connection" button. */
  async test(): Promise<{ ok: boolean; message: string }> {
    const page = await this.get<KumaStatusPageResponse>(
      `/api/status-page/${encodeURIComponent(this.slug)}`
    );
    if (!page) {
      return {
        ok: false,
        message:
          "Could not reach that status page. Check the URL and slug, and that the status page is published.",
      };
    }
    const monitors = parseKumaMonitors(page);
    if (monitors.length === 0) {
      return {
        ok: false,
        message: "Reached Kuma, but that status page has no monitors on it.",
      };
    }
    return { ok: true, message: `Connected. Found ${monitors.length} monitor(s).` };
  }
}
