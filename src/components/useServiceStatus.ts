"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MonitorHealth } from "@/lib/status/types";

const POLL_INTERVAL_MS = 30_000;

/**
 * Polls /api/status on an interval, without ever blocking or reloading the page.
 *
 * Pauses while the tab is hidden — a portal left open in a background tab
 * shouldn't keep hitting the server — and refetches immediately on return so
 * the user never looks at stale dots.
 */
export function useServiceStatus() {
  const [statuses, setStatuses] = useState<Record<string, MonitorHealth>>({});
  const [hasLoaded, setHasLoaded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchStatuses = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/status", {
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok) {
        // 401 means the session expired; everything else is a server-side
        // problem. Either way the indicators go unknown rather than erroring.
        setStatuses({});
        return;
      }
      const body = (await res.json()) as { statuses: Record<string, MonitorHealth> };
      setStatuses(body.statuses ?? {});
    } catch {
      // Aborted or offline — keep the last known values rather than flashing.
    } finally {
      setHasLoaded(true);
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(fetchStatuses, POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchStatuses();
        start();
      } else {
        stop();
      }
    };

    void fetchStatuses();
    start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      abortRef.current?.abort();
    };
  }, [fetchStatuses]);

  return { statuses, hasLoaded };
}
