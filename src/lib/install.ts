/**
 * Deciding whether to offer "install this app", and how.
 *
 * Three different worlds:
 *
 *  - **Android Chrome and desktop Chrome/Edge** fire `beforeinstallprompt` once
 *    the app meets the installability criteria. Capture it, show our own
 *    button, and call `prompt()` from a click. This is the real prompt.
 *  - **iOS Safari** has no such event and never will — Add to Home Screen lives
 *    in the Share sheet and cannot be triggered by a page. All we can do is say
 *    where it is.
 *  - **Already installed**, on any platform: say nothing.
 *
 * Note the installability criteria are why a service worker exists in this app
 * at all (public/sw.js). Without one registered, Chrome never fires the event
 * and the button would simply never appear.
 */

/** Where a dismissal is remembered. Dismissing is permanent — this shouldn't nag. */
export const INSTALL_DISMISSED_KEY = "portal:install-dismissed";

type StandaloneNavigator = { standalone?: boolean };
type DisplayModeWindow = { matchMedia?: (query: string) => { matches: boolean } };

/**
 * Whether the portal is already running as an installed app.
 *
 * `display-mode: standalone` covers Chrome, Edge and Android; iOS answers
 * through `navigator.standalone` instead, since Safari didn't support the media
 * query for home-screen web apps until relatively recently.
 */
export function isInstalled(win: DisplayModeWindow, nav: StandaloneNavigator): boolean {
  if (nav.standalone === true) return true;
  if (!win.matchMedia) return false;
  // minimal-ui and fullscreen are also "installed" as far as this prompt cares.
  return ["standalone", "minimal-ui", "fullscreen"].some(
    (mode) => win.matchMedia!(`(display-mode: ${mode})`).matches
  );
}

/**
 * Whether this is iOS Safari, browsing normally.
 *
 * `navigator.standalone` is defined only by Safari on iOS, so the property
 * being present and false is a precise test for "iOS Safari, not installed" —
 * no user-agent sniffing, and it stays false for every other browser on every
 * other platform, where the real prompt handles things instead.
 */
export function isIosBrowser(nav: StandaloneNavigator): boolean {
  return nav.standalone === false;
}

export type InstallOffer = "none" | "prompt" | "ios-instructions";

/**
 * What, if anything, to show.
 *
 * Kept pure and separate from the component so every branch is testable — the
 * combinations that matter (installed on iOS, iOS Safari, Android before the
 * event arrives, dismissed) are all awkward to reach in a real browser.
 */
export function chooseInstallOffer({
  installed,
  dismissed,
  hasPromptEvent,
  iosBrowser,
}: {
  installed: boolean;
  dismissed: boolean;
  hasPromptEvent: boolean;
  iosBrowser: boolean;
}): InstallOffer {
  if (installed || dismissed) return "none";
  // The real prompt wins wherever it is available.
  if (hasPromptEvent) return "prompt";
  if (iosBrowser) return "ios-instructions";
  // Everywhere else: either the criteria aren't met yet, the app is already
  // installed under a different profile, or the browser doesn't support
  // installing at all. Saying nothing is the honest answer.
  return "none";
}
