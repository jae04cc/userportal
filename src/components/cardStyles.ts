import type { CardLayout, CardLayouts } from "@/lib/settings";

export type { CardLayout, CardLayouts };

/**
 * Class strings for every mobile/desktop layout combination.
 *
 * Written out in full rather than composed at runtime for two reasons: Tailwind
 * only sees class names that appear literally in source, and one DOM tree with
 * breakpoint-conditional classes beats rendering both layouts and hiding one —
 * which would double the markup and confuse screen readers.
 *
 * `sm:` (640px) is the mobile/desktop boundary throughout.
 */
export type CardStyle = {
  grid: string;
  shell: string;
  icon: string;
  body: string;
  name: string;
  description: string;
};

const COMPACT_SHELL = "flex min-h-[6.25rem] flex-col items-center justify-center gap-3 p-3 text-center";
const DETAILED_SHELL = "flex min-h-[5rem] flex-row items-center gap-3.5 p-3.5 text-left";

export const CARD_STYLES: Record<string, CardStyle> = {
  "compact-compact": {
    grid: "grid-cols-3 sm:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]",
    shell: `${COMPACT_SHELL} sm:p-4`,
    icon: "h-9 w-9 sm:h-10 sm:w-10",
    body: "w-full min-w-0",
    name: "block text-xs font-bold leading-tight line-clamp-2 sm:text-sm",
    description: "hidden",
  },

  "compact-detailed": {
    grid: "grid-cols-3 sm:grid-cols-[repeat(auto-fill,minmax(17rem,1fr))]",
    // Flips from a centred column to a left-aligned row at sm.
    shell: `${COMPACT_SHELL} sm:min-h-[5rem] sm:flex-row sm:gap-3.5 sm:p-4 sm:text-left`,
    icon: "h-9 w-9 sm:h-10 sm:w-10",
    body: "w-full min-w-0 sm:flex-1",
    // line-clamp and truncate conflict, so the clamp is explicitly released
    // before truncate takes over.
    name: "block text-xs font-bold leading-tight line-clamp-2 sm:line-clamp-none sm:truncate sm:text-base sm:font-medium sm:leading-normal",
    description: "hidden sm:mt-0.5 sm:block sm:truncate",
  },

  "detailed-compact": {
    grid: "grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]",
    shell: `${DETAILED_SHELL} sm:min-h-[6.25rem] sm:flex-col sm:justify-center sm:gap-3 sm:p-4 sm:text-center`,
    icon: "h-10 w-10 sm:h-9 sm:w-9",
    body: "min-w-0 flex-1 sm:w-full sm:flex-none",
    name: "block truncate text-base font-medium sm:whitespace-normal sm:line-clamp-2 sm:text-sm sm:font-bold sm:leading-tight",
    description: "mt-0.5 block truncate text-sm sm:hidden",
  },

  "detailed-detailed": {
    grid: "grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(17rem,1fr))]",
    shell: `${DETAILED_SHELL} sm:p-4`,
    icon: "h-10 w-10",
    body: "min-w-0 flex-1",
    name: "block truncate text-base font-medium",
    description: "mt-0.5 block truncate text-sm",
  },
};

export function cardStyle(layouts: CardLayouts): CardStyle {
  return CARD_STYLES[`${layouts.mobile}-${layouts.desktop}`] ?? CARD_STYLES["compact-detailed"];
}

/** True when the description is hidden at every width, so it needn't render. */
export function descriptionHidden(layouts: CardLayouts): boolean {
  return layouts.mobile === "compact" && layouts.desktop === "compact";
}
