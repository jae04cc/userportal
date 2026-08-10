import { describe, it, expect } from "vitest";
import {
  mapKumaStatus,
  parseKumaResponses,
  parseKumaMonitors,
  parseKumaTime,
  inferIntervalMs,
  staleThresholdMs,
  type KumaHeartbeatResponse,
  type KumaStatusPageResponse,
} from "./kuma";
import { HISTORY_LENGTH } from "./types";

const NOW = Date.parse("2026-08-08T12:00:00Z");
const recent = new Date(NOW - 30_000).toISOString();
const stale = new Date(NOW - 60 * 60_000).toISOString();

function page(
  monitors: Array<{ id: number; name: string }>,
  groupName = "Services"
): KumaStatusPageResponse {
  return { publicGroupList: [{ name: groupName, monitorList: monitors }] };
}

describe("mapKumaStatus", () => {
  it("maps UP to up", () => expect(mapKumaStatus(1)).toBe("up"));
  it("maps DOWN to down", () => expect(mapKumaStatus(0)).toBe("down"));
  it("maps PENDING to degraded", () => expect(mapKumaStatus(2)).toBe("degraded"));
  it("maps MAINTENANCE to degraded", () => expect(mapKumaStatus(3)).toBe("degraded"));
  it("maps anything unrecognised to unknown", () => expect(mapKumaStatus(99)).toBe("unknown"));
});

describe("parseKumaTime", () => {
  it("parses an ISO timestamp", () => {
    expect(parseKumaTime("2026-08-08T12:00:00Z")).toBe(NOW);
  });

  it("treats Kuma's naive format as UTC rather than local time", () => {
    // The bug this guards: parsed as local time, a fresh heartbeat can look
    // hours old and get wrongly reported as stale.
    expect(parseKumaTime("2026-08-08 12:00:00")).toBe(NOW);
  });

  it("returns null for junk", () => {
    expect(parseKumaTime("")).toBeNull();
    expect(parseKumaTime("not a date")).toBeNull();
  });
});

describe("parseKumaResponses", () => {
  it("registers each monitor under both its id and its name", () => {
    const result = parseKumaResponses(
      page([{ id: 7, name: "Jellyfin" }]),
      { heartbeatList: { "7": [{ status: 1, time: recent }] } },
      NOW
    );
    // Binding by id survives a rename in Kuma; binding by name is what a
    // hand-typed monitor key looks like. Both must resolve.
    expect(result.get("7")?.status).toBe("up");
    expect(result.get("Jellyfin")?.status).toBe("up");
  });

  it("uses the most recent heartbeat, not the first", () => {
    const result = parseKumaResponses(
      page([{ id: 1, name: "Nextcloud" }]),
      {
        heartbeatList: {
          "1": [
            { status: 1, time: recent },
            { status: 0, time: recent },
          ],
        },
      },
      NOW
    );
    expect(result.get("Nextcloud")?.status).toBe("down");
  });

  it("reads 24h uptime when Kuma reports it", () => {
    const result = parseKumaResponses(
      page([{ id: 1, name: "A" }]),
      { heartbeatList: { "1": [{ status: 1, time: recent }] }, uptimeList: { "1_24": 0.998 } },
      NOW
    );
    expect(result.get("A")?.uptime24h).toBeCloseTo(0.998);
  });

  it("leaves uptime null when Kuma doesn't report it", () => {
    const result = parseKumaResponses(
      page([{ id: 1, name: "A" }]),
      { heartbeatList: { "1": [{ status: 1, time: recent }] } },
      NOW
    );
    expect(result.get("A")?.uptime24h).toBeNull();
  });

  it("exposes the last check time", () => {
    const result = parseKumaResponses(
      page([{ id: 1, name: "A" }]),
      { heartbeatList: { "1": [{ status: 1, time: recent }] } },
      NOW
    );
    expect(result.get("A")?.lastCheckAt).toBe(Date.parse(recent));
  });

  it("reads monitors across multiple public groups", () => {
    const multi: KumaStatusPageResponse = {
      publicGroupList: [
        { name: "Media", monitorList: [{ id: 1, name: "A" }] },
        { name: "Tools", monitorList: [{ id: 2, name: "B" }] },
      ],
    };
    const result = parseKumaResponses(
      multi,
      { heartbeatList: { "1": [{ status: 1, time: recent }], "2": [{ status: 0, time: recent }] } },
      NOW
    );
    expect(result.get("A")?.status).toBe("up");
    expect(result.get("B")?.status).toBe("down");
  });

  it("returns unknown for a monitor with no heartbeats", () => {
    const result = parseKumaResponses(page([{ id: 3, name: "Ghost" }]), { heartbeatList: {} }, NOW);
    expect(result.get("Ghost")?.status).toBe("unknown");
  });

  it("returns unknown for an empty heartbeat array", () => {
    const result = parseKumaResponses(
      page([{ id: 3, name: "Ghost" }]),
      { heartbeatList: { "3": [] } },
      NOW
    );
    expect(result.get("Ghost")?.status).toBe("unknown");
  });

  it("treats a stale heartbeat as unknown rather than trusting an old up", () => {
    const result = parseKumaResponses(
      page([{ id: 4, name: "Abandoned" }]),
      { heartbeatList: { "4": [{ status: 1, time: stale }] } },
      NOW
    );
    expect(result.get("Abandoned")?.status).toBe("unknown");
  });

  it("does not flag a recent heartbeat as stale", () => {
    const result = parseKumaResponses(
      page([{ id: 5, name: "Fresh" }]),
      { heartbeatList: { "5": [{ status: 1, time: recent }] } },
      NOW
    );
    expect(result.get("Fresh")?.status).toBe("up");
  });

  it("returns an empty map for an empty status page", () => {
    expect(parseKumaResponses({}, {}, NOW).size).toBe(0);
  });

  it("survives malformed payloads without throwing", () => {
    const malformed = {
      publicGroupList: [{ monitorList: [{ id: "nope", name: 42 }] }],
    } as unknown as KumaStatusPageResponse;
    expect(() => parseKumaResponses(malformed, {}, NOW)).not.toThrow();
    expect(parseKumaResponses(malformed, {}, NOW).size).toBe(0);
  });

  it("survives a heartbeat entry with no status field", () => {
    const result = parseKumaResponses(
      page([{ id: 6, name: "Broken" }]),
      { heartbeatList: { "6": [{ time: recent } as never] } },
      NOW
    );
    expect(result.get("Broken")?.status).toBe("unknown");
  });
});

describe("staleness scales to the monitor's own check interval", () => {
  /** Builds `count` beats ending `endedMinsAgo` minutes ago, `intervalMins` apart. */
  function beats(count: number, intervalMins: number, endedMinsAgo: number) {
    return Array.from({ length: count }, (_, i) => ({
      status: 1,
      time: new Date(NOW - (endedMinsAgo + (count - 1 - i) * intervalMins) * 60_000).toISOString(),
    }));
  }

  it("infers the interval from the median gap", () => {
    const times = [0, 1800_000, 3600_000, 5400_000];
    expect(inferIntervalMs(times)).toBe(1800_000);
  });

  it("uses the median so one outage gap doesn't inflate the estimate", () => {
    const times = [0, 60_000, 120_000, 7_200_000, 7_260_000, 7_320_000];
    expect(inferIntervalMs(times)).toBe(60_000);
  });

  it("returns null when there aren't enough beats to tell", () => {
    expect(inferIntervalMs([])).toBeNull();
    expect(inferIntervalMs([123])).toBeNull();
  });

  it("never calls a fast monitor stale sooner than the floor", () => {
    // 2.5 x 20s would be 50s — one missed check shouldn't flip it to unknown.
    expect(staleThresholdMs(20_000)).toBe(5 * 60_000);
  });

  it("scales the window up for a slow monitor", () => {
    expect(staleThresholdMs(30 * 60_000)).toBe(75 * 60_000);
  });

  it("caps the window so a truly dead monitor still goes unknown", () => {
    expect(staleThresholdMs(30 * 24 * 60 * 60_000)).toBe(24 * 60 * 60_000);
  });

  it("keeps a 30-minute monitor UP when its last beat is 20 minutes old", () => {
    // The real-world case this was written for: a 30-minute check interval with
    // a beat 0.7 intervals old is healthy, but a flat 10-minute threshold
    // reported it as unknown.
    const result = parseKumaResponses(
      page([{ id: 1, name: "Slow" }]),
      { heartbeatList: { "1": beats(10, 30, 20) } },
      NOW
    );
    expect(result.get("Slow")!.status).toBe("up");
  });

  it("still marks that same monitor unknown once it misses several checks", () => {
    const result = parseKumaResponses(
      page([{ id: 1, name: "Slow" }]),
      { heartbeatList: { "1": beats(10, 30, 120) } },
      NOW
    );
    expect(result.get("Slow")!.status).toBe("unknown");
  });

  it("marks a fast monitor unknown when it goes quiet for far longer than its interval", () => {
    const result = parseKumaResponses(
      page([{ id: 1, name: "Fast" }]),
      { heartbeatList: { "1": beats(10, 1, 30) } },
      NOW
    );
    expect(result.get("Fast")!.status).toBe("unknown");
  });

  it("keeps a fast monitor up across a single missed check", () => {
    const result = parseKumaResponses(
      page([{ id: 1, name: "Fast" }]),
      { heartbeatList: { "1": beats(10, 1, 2) } },
      NOW
    );
    expect(result.get("Fast")!.status).toBe("up");
  });
});

describe("heartbeat history (drives the status pane's strip)", () => {
  it("returns beats oldest-first, matching left-to-right render order", () => {
    const result = parseKumaResponses(
      page([{ id: 1, name: "A" }]),
      {
        heartbeatList: {
          "1": [
            { status: 0, time: recent },
            { status: 1, time: recent },
          ],
        },
      },
      NOW
    );
    const history = result.get("A")!.history;
    expect(history.map((b) => b.status)).toEqual(["down", "up"]);
  });

  it("trims to the strip length rather than returning all 100 beats", () => {
    const many = Array.from({ length: 100 }, () => ({ status: 1, time: recent }));
    const result = parseKumaResponses(
      page([{ id: 1, name: "A" }]),
      { heartbeatList: { "1": many } },
      NOW
    );
    expect(result.get("A")!.history).toHaveLength(HISTORY_LENGTH);
  });

  it("keeps the MOST RECENT beats when trimming", () => {
    const beats = [
      ...Array.from({ length: 60 }, () => ({ status: 0, time: recent })),
      ...Array.from({ length: HISTORY_LENGTH }, () => ({ status: 1, time: recent })),
    ];
    const result = parseKumaResponses(
      page([{ id: 1, name: "A" }]),
      { heartbeatList: { "1": beats } },
      NOW
    );
    expect(result.get("A")!.history.every((b) => b.status === "up")).toBe(true);
  });

  it("carries ping per beat and null when absent", () => {
    const result = parseKumaResponses(
      page([{ id: 1, name: "A" }]),
      { heartbeatList: { "1": [{ status: 1, time: recent, ping: 42 }, { status: 1, time: recent }] } },
      NOW
    );
    const history = result.get("A")!.history;
    expect(history[0].ping).toBe(42);
    expect(history[1].ping).toBeNull();
  });

  it("exposes the latest ping at the top level", () => {
    const result = parseKumaResponses(
      page([{ id: 1, name: "A" }]),
      { heartbeatList: { "1": [{ status: 1, time: recent, ping: 12 }, { status: 1, time: recent, ping: 88 }] } },
      NOW
    );
    expect(result.get("A")!.ping).toBe(88);
  });

  it("suppresses the ping figure when the data is stale", () => {
    // A stale monitor reports unknown; showing its last ping would imply the
    // number is current.
    const result = parseKumaResponses(
      page([{ id: 1, name: "A" }]),
      { heartbeatList: { "1": [{ status: 1, time: stale, ping: 42 }] } },
      NOW
    );
    expect(result.get("A")!.status).toBe("unknown");
    expect(result.get("A")!.ping).toBeNull();
  });

  it("still returns the history for a stale monitor, so the strip shows what happened", () => {
    const result = parseKumaResponses(
      page([{ id: 1, name: "A" }]),
      { heartbeatList: { "1": [{ status: 1, time: stale }] } },
      NOW
    );
    expect(result.get("A")!.history).toHaveLength(1);
  });

  it("marks a beat with a non-numeric status as unknown rather than dropping it", () => {
    const result = parseKumaResponses(
      page([{ id: 1, name: "A" }]),
      { heartbeatList: { "1": [{ time: recent } as never, { status: 1, time: recent }] } },
      NOW
    );
    const history = result.get("A")!.history;
    expect(history).toHaveLength(2);
    expect(history[0].status).toBe("unknown");
  });

  it("is empty when there are no heartbeats", () => {
    const result = parseKumaResponses(page([{ id: 1, name: "A" }]), { heartbeatList: {} }, NOW);
    expect(result.get("A")!.history).toEqual([]);
  });
});

describe("parseKumaMonitors", () => {
  it("returns each monitor with its Kuma group name, used as a category", () => {
    const result = parseKumaMonitors(page([{ id: 1, name: "Jellyfin" }], "Media"));
    expect(result).toEqual([{ id: "1", name: "Jellyfin", groupName: "Media" }]);
  });

  it("falls back to a default group name when the group is unnamed", () => {
    const unnamed: KumaStatusPageResponse = {
      publicGroupList: [{ monitorList: [{ id: 1, name: "A" }] }],
    };
    expect(parseKumaMonitors(unnamed)[0].groupName).toBe("Services");
  });

  it("returns an empty list for an empty page", () => {
    expect(parseKumaMonitors({})).toEqual([]);
  });
});
