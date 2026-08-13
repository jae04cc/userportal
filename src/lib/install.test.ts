import { describe, expect, it } from "vitest";
import { chooseInstallOffer, isInstalled, isIosBrowser } from "@/lib/install";

/** A window whose display-mode query answers for exactly one mode. */
function windowIn(mode: string | null) {
  return { matchMedia: (query: string) => ({ matches: mode !== null && query.includes(mode) }) };
}

describe("isInstalled", () => {
  it("is true for an installed app on Chrome, Edge or Android", () => {
    expect(isInstalled(windowIn("standalone"), {})).toBe(true);
    expect(isInstalled(windowIn("minimal-ui"), {})).toBe(true);
    expect(isInstalled(windowIn("fullscreen"), {})).toBe(true);
  });

  it("is true for an iOS home-screen app, which answers differently", () => {
    // iOS reports through navigator.standalone rather than the media query.
    expect(isInstalled(windowIn(null), { standalone: true })).toBe(true);
  });

  it("is false in an ordinary browser tab", () => {
    expect(isInstalled(windowIn("browser"), {})).toBe(false);
    expect(isInstalled(windowIn("browser"), { standalone: false })).toBe(false);
  });

  it("does not throw where matchMedia is unavailable", () => {
    expect(isInstalled({}, {})).toBe(false);
  });
});

describe("isIosBrowser", () => {
  it("is true only in iOS Safari, browsing normally", () => {
    expect(isIosBrowser({ standalone: false })).toBe(true);
  });

  it("is false once installed, and everywhere that isn't iOS", () => {
    expect(isIosBrowser({ standalone: true })).toBe(false);
    // Undefined on Chrome, Edge, Firefox and Android — those get the real prompt.
    expect(isIosBrowser({})).toBe(false);
  });
});

describe("chooseInstallOffer", () => {
  const base = { installed: false, dismissed: false, hasPromptEvent: false, iosBrowser: false };

  it("offers the real prompt once the browser has fired the event", () => {
    expect(chooseInstallOffer({ ...base, hasPromptEvent: true })).toBe("prompt");
  });

  it("falls back to instructions on iOS, which has no event", () => {
    expect(chooseInstallOffer({ ...base, iosBrowser: true })).toBe("ios-instructions");
  });

  it("says nothing while the browser is still deciding", () => {
    // Chrome fires beforeinstallprompt asynchronously, so this is the state on
    // first paint everywhere. It must render nothing rather than flash.
    expect(chooseInstallOffer(base)).toBe("none");
  });

  it("says nothing once installed, on any platform", () => {
    expect(chooseInstallOffer({ ...base, installed: true, hasPromptEvent: true })).toBe("none");
    expect(chooseInstallOffer({ ...base, installed: true, iosBrowser: true })).toBe("none");
  });

  it("stays quiet after a dismissal, even when it could prompt", () => {
    expect(chooseInstallOffer({ ...base, dismissed: true, hasPromptEvent: true })).toBe("none");
    expect(chooseInstallOffer({ ...base, dismissed: true, iosBrowser: true })).toBe("none");
  });

  it("prefers the real prompt over instructions if somehow both apply", () => {
    expect(chooseInstallOffer({ ...base, hasPromptEvent: true, iosBrowser: true })).toBe("prompt");
  });
});
