export type ServiceStatus = "up" | "down" | "degraded" | "unknown";

/** One check, as rendered by a single bar in the status pane's heartbeat strip. */
export type Beat = {
  status: ServiceStatus;
  /** Response time in ms, or null when the source didn't report one. */
  ping: number | null;
  /** Epoch ms, or null when unparseable. */
  at: number | null;
};

/** How many beats the pane renders. Kuma returns up to 100; this is a slim strip. */
export const HISTORY_LENGTH = 40;

export type MonitorHealth = {
  status: ServiceStatus;
  /** 0–1 over the last 24h, or null when the source doesn't report it. */
  uptime24h: number | null;
  /** Epoch ms of the most recent heartbeat, or null if unknown. */
  lastCheckAt: number | null;
  /** Most recent response time in ms, or null. */
  ping: number | null;
  /** Oldest-first, at most HISTORY_LENGTH entries. Empty when unknown. */
  history: Beat[];
};

/**
 * Keyed by BOTH the monitor's numeric id (as a string) and its display name, so
 * a service can bind either way. Imported services bind by id, which survives a
 * rename in Kuma; hand-typed bindings by name still resolve.
 */
export type StatusMap = Map<string, MonitorHealth>;

/** What the admin "import from Kuma" screen lists. */
export type DiscoveredMonitor = {
  id: string;
  name: string;
  /** The Kuma status-page group this monitor sits in, used as a category name. */
  groupName: string;
};

export interface StatusProvider {
  readonly name: string;
  /** Must never throw. On any failure it returns an empty map. */
  fetchStatuses(): Promise<StatusMap>;
  /** Must never throw. Returns [] on failure. */
  discoverMonitors(): Promise<DiscoveredMonitor[]>;
}

export const UNKNOWN: MonitorHealth = {
  status: "unknown",
  uptime24h: null,
  lastCheckAt: null,
  ping: null,
  history: [],
};
