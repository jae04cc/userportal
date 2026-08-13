/**
 * Getting a service link out of an iOS Home Screen web app and into Safari.
 *
 * Every other platform already does the right thing with `target="_blank"`: a
 * Windows or macOS installed app hands an out-of-scope link to the default
 * browser, and Android opens a Custom Tab that shares Chrome's cookies. iOS is
 * the outlier — a Home Screen web app opens external links in an in-app browser
 * view backed by its OWN website-data store, separate from Safari's. The
 * practical cost isn't the chrome, it's that you aren't signed in to anything.
 *
 * There is no supported web API to escape that. `window.open`, `target=_blank`
 * and `rel=noopener` all stay inside the web app by design. The one lever left
 * is the `x-safari-` URL scheme, which iOS treats as "open this in Safari".
 * It's well established from Shortcuts and native apps, but whether a web app's
 * webview hands it off to the system is not documented, so everything here is
 * built to fail softly: if the scheme is ignored, the fallback performs the
 * navigation that would have happened anyway.
 */

/** How long to wait for iOS to take over before assuming the scheme was ignored. */
export const SAFARI_HANDOFF_MS = 600;

/**
 * The `x-safari-` form of an external URL, or null if this URL should be left
 * alone.
 *
 * Only absolute http(s) URLs qualify. Anything else — a relative path, a
 * `mailto:`, or a scheme already carrying an `x-` prefix — is either internal
 * or already handled by the OS, and wrapping it would break it.
 */
export function toSafariUrl(url: string): string | null {
  if (!/^https?:\/\/./i.test(url)) return null;
  return `x-safari-${url}`;
}

/**
 * Whether this is an iOS Home Screen web app.
 *
 * `navigator.standalone` is Apple-only and undefined everywhere else, which
 * makes it a precise test with no user-agent sniffing: true here means iOS and
 * launched from the Home Screen, the exact and only case that needs the escape.
 */
/** Only the one property matters, and it isn't in lib.dom's Navigator. */
type AppleNavigator = { standalone?: boolean };

export function isIosStandalone(
  nav: AppleNavigator = typeof navigator === "undefined" ? {} : (navigator as AppleNavigator)
): boolean {
  return nav.standalone === true;
}

/**
 * Whether a click should be intercepted at all.
 *
 * Anything with a modifier held, or from a non-primary button, is the user
 * asking the browser for something specific — open in a new tab, paste-and-go.
 * Those are honoured rather than hijacked, even though neither really occurs on
 * a phone.
 */
export function isPlainClick(event: {
  button?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  defaultPrevented?: boolean;
}): boolean {
  return (
    !event.defaultPrevented &&
    (event.button ?? 0) === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

type HandoffDeps = {
  navigate: (url: string) => void;
  /** Whether this document has been backgrounded — i.e. something else took over. */
  isHidden: () => boolean;
  addListener: (type: string, handler: () => void) => void;
  removeListener: (type: string, handler: () => void) => void;
  setTimer: (fn: () => void, ms: number) => void;
};

/**
 * Ask iOS to open `url` in Safari, and put it back the way it was if it won't.
 *
 * The handoff is detected by the document being backgrounded: if Safari comes
 * to the front, this page is hidden and the fallback is cancelled. If nothing
 * happens within the timeout, the plain URL is navigated to, which is exactly
 * what the link would have done untouched.
 *
 * Dependencies are injected so the timing and the cancellation are testable
 * without a browser — the whole point of this function is what it does when the
 * scheme is NOT supported, which is unreachable in any environment I can run.
 */
export function requestSafariHandoff(
  url: string,
  deps: HandoffDeps,
  timeoutMs: number = SAFARI_HANDOFF_MS
): void {
  const escaped = toSafariUrl(url);
  if (!escaped) {
    deps.navigate(url);
    return;
  }

  let handedOff = false;
  const settle = () => {
    handedOff = true;
  };

  // Either event means we're no longer the foreground page.
  deps.addListener("visibilitychange", settle);
  deps.addListener("pagehide", settle);

  deps.setTimer(() => {
    deps.removeListener("visibilitychange", settle);
    deps.removeListener("pagehide", settle);
    if (handedOff || deps.isHidden()) return;
    deps.navigate(url);
  }, timeoutMs);

  deps.navigate(escaped);
}
