import { describe, it, expect } from "vitest";
import {
  mapKumaStatus,
  parseKumaResponses,
  parseKumaMonitors,
  parseKumaTime,
  type KumaHeartbeatResponse,
  type KumaStatusPageResponse,
} from "./kuma";

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
