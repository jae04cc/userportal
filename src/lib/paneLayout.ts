/**
 * Pure status-pane layout parsing.
 *
 * Separate from settings.ts purely so it can be unit tested: settings.ts is
 * `server-only`, which throws on import outside a server component, and the
 * subtlety below is exactly the kind that deserves a test.
 */

/** Valid "collapse after" choices. 0 means never collapse. */
export const COLLAPSE_AFTER_OPTIONS = [0, 2, 3, 4, 6, 8, 12] as const;

/**
 * Past four tiles the pane stops being a glanceable strip and starts pushing the
 * message of the day and the service cards below the fold.
 */
export const DEFAULT_COLLAPSE_AFTER = 4;

/**
 * How many tiles stay visible before the rest fold behind a toggle.
 *
 * The empty check is load-bearing and must come BEFORE the parse. `Number(null)`
 * and `Number("")` are both 0, and 0 is a meaningful value here — it means
 * "never collapse" — so a missing setting would otherwise sail straight through
 * the validity check and turn the feature off for everyone who never opened the
 * admin page.
 */
export function parseCollapseAfter(raw: string | null | undefined): number {
  if (raw === null || raw === undefined || raw.trim() === "") return DEFAULT_COLLAPSE_AFTER;

  const parsed = Number(raw);
  return (COLLAPSE_AFTER_OPTIONS as readonly number[]).includes(parsed)
    ? parsed
    : DEFAULT_COLLAPSE_AFTER;
}
