import "server-only";
import type { DiscoveredMonitor, StatusMap } from "./types";
import { KumaStatusProvider } from "./kuma";
import { getKumaConfig } from "@/lib/settings";

export type { ServiceStatus, StatusMap, MonitorHealth, DiscoveredMonitor } from "./types";
export { UNKNOWN } from "./types";

const CACHE_TTL_MS = 20_000;

/**
 * Module-level cache. Twenty users polling every 30s must not become twenty
 * requests per 30s against Kuma — one upstream fetch per TTL window serves
 * everyone. Also collapses concurrent misses onto a single in-flight promise.
 *
 * The cache is keyed by the config it was fetched with, so saving new Kuma
 * settings in the admin area takes effect on the very next request rather than
 * serving up to 20s of results from the old server.
 */
let cached: { key: string; at: number; data: StatusMap } | null = null;
let inFlight: { key: string; promise: Promise<StatusMap> } | null = null;

export async function getKumaProvider(): Promise<KumaStatusProvider | null> {
  const config = await getKumaConfig();
  if (!config.configured) return null;
  return new KumaStatusProvider(config.baseUrl, config.slug);
}

export async function getStatuses(): Promise<StatusMap> {
  const config = await getKumaConfig();
  if (!config.configured) return new Map();

  const key = `${config.baseUrl}|${config.slug}`;
  const now = Date.now();

  if (cached && cached.key === key && now - cached.at < CACHE_TTL_MS) return cached.data;
  if (inFlight && inFlight.key === key) return inFlight.promise;

  const promise = new KumaStatusProvider(config.baseUrl, config.slug)
    .fetchStatuses()
    .then((data) => {
      cached = { key, at: Date.now(), data };
      return data;
    })
    .finally(() => {
      if (inFlight?.key === key) inFlight = null;
    });

  inFlight = { key, promise };
  return promise;
}

/** Drops the cache immediately — called after the Kuma settings are changed. */
export function invalidateStatusCache() {
  cached = null;
  inFlight = null;
}

export async function discoverMonitors(): Promise<DiscoveredMonitor[]> {
  const provider = await getKumaProvider();
  return provider ? provider.discoverMonitors() : [];
}
