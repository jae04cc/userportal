import { describe, expect, it, vi } from "vitest";
import {
  isIosStandalone,
  isPlainClick,
  requestSafariHandoff,
  toSafariUrl,
} from "@/lib/externalLink";

describe("toSafariUrl", () => {
  it("wraps absolute http(s) URLs", () => {
    expect(toSafariUrl("https://jellyfin.example.com")).toBe("x-safari-https://jellyfin.example.com");
    expect(toSafariUrl("http://192.168.86.5:8096/web/")).toBe("x-safari-http://192.168.86.5:8096/web/");
  });

  it("leaves anything that isn't an external page alone", () => {
    // Internal links stay in the app; OS-handled schemes already work; a bare
    // "https://" with no host is not a destination.
    for (const url of ["/admin", "info/123", "mailto:a@b.c", "tel:+1", "https://", "ftp://x"]) {
      expect(toSafariUrl(url)).toBeNull();
    }
  });

  it("does not double-wrap", () => {
    expect(toSafariUrl("x-safari-https://example.com")).toBeNull();
  });
});

describe("isIosStandalone", () => {
  it("is true only for an iOS Home Screen web app", () => {
    expect(isIosStandalone({ standalone: true })).toBe(true);
  });

  it("is false in iOS Safari, and on every other platform", () => {
    expect(isIosStandalone({ standalone: false })).toBe(false);
    // Undefined everywhere that isn't Apple — this is what keeps the escape
    // from firing on Windows and Android, where target=_blank already works.
    expect(isIosStandalone({})).toBe(false);
  });
});

describe("isPlainClick", () => {
  it("accepts an ordinary tap", () => {
    expect(isPlainClick({})).toBe(true);
    expect(isPlainClick({ button: 0 })).toBe(true);
  });

  it("defers to the browser when the user asked for something specific", () => {
    expect(isPlainClick({ button: 1 })).toBe(false);
    expect(isPlainClick({ metaKey: true })).toBe(false);
    expect(isPlainClick({ ctrlKey: true })).toBe(false);
    expect(isPlainClick({ shiftKey: true })).toBe(false);
    expect(isPlainClick({ altKey: true })).toBe(false);
    expect(isPlainClick({ defaultPrevented: true })).toBe(false);
  });
});

/** A scriptable stand-in for the browser, so the timeout path is reachable. */
function harness({ hidden = false }: { hidden?: boolean } = {}) {
  const navigated: string[] = [];
  const listeners = new Map<string, Set<() => void>>();
  let timer: (() => void) | null = null;
  let timerMs: number | null = null;
  const state = { hidden };

  return {
    navigated,
    state,
    get timerMs() {
      return timerMs;
    },
    /** Run whatever was scheduled, as if the timeout elapsed. */
    fireTimer() {
      timer?.();
    },
    /** Simulate iOS bringing Safari to the front. */
    background() {
      state.hidden = true;
      for (const handler of listeners.get("visibilitychange") ?? []) handler();
    },
    deps: {
      navigate: (url: string) => navigated.push(url),
      isHidden: () => state.hidden,
      addListener: (type: string, handler: () => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(handler);
      },
      removeListener: (type: string, handler: () => void) => {
        listeners.get(type)?.delete(handler);
      },
      setTimer: (fn: () => void, ms: number) => {
        timer = fn;
        timerMs = ms;
      },
    },
  };
}

describe("requestSafariHandoff", () => {
  it("asks Safari first", () => {
    const h = harness();
    requestSafariHandoff("https://jellyfin.example.com", h.deps);
    expect(h.navigated).toEqual(["x-safari-https://jellyfin.example.com"]);
  });

  it("falls back to the plain URL when the scheme is ignored", () => {
    // The case that matters: iOS does nothing, and the link must still work.
    const h = harness();
    requestSafariHandoff("https://jellyfin.example.com", h.deps);
    h.fireTimer();
    expect(h.navigated).toEqual([
      "x-safari-https://jellyfin.example.com",
      "https://jellyfin.example.com",
    ]);
  });

  it("does not double-navigate once Safari has taken over", () => {
    const h = harness();
    requestSafariHandoff("https://jellyfin.example.com", h.deps);
    h.background();
    h.fireTimer();
    expect(h.navigated).toEqual(["x-safari-https://jellyfin.example.com"]);
  });

  it("catches a handoff even if the event was missed", () => {
    // Backgrounding without the listener firing still counts, so a slow or
    // swallowed visibilitychange can't cause a second navigation.
    const h = harness();
    requestSafariHandoff("https://jellyfin.example.com", h.deps);
    h.state.hidden = true;
    h.fireTimer();
    expect(h.navigated).toEqual(["x-safari-https://jellyfin.example.com"]);
  });

  it("drops its listeners once it has decided", () => {
    const h = harness();
    const remove = vi.spyOn(h.deps, "removeListener");
    requestSafariHandoff("https://jellyfin.example.com", h.deps);
    h.fireTimer();
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it("navigates straight to anything not eligible for the escape", () => {
    const h = harness();
    requestSafariHandoff("/admin", h.deps);
    expect(h.navigated).toEqual(["/admin"]);
    expect(h.timerMs).toBeNull();
  });
});
