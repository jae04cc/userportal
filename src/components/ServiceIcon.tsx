import * as Icons from "lucide-react";
import { LayoutGrid, type LucideIcon } from "lucide-react";
import { isImageIcon } from "@/lib/icons";

/** "clapperboard" / "hard-drive" → "Clapperboard" / "HardDrive", matching lucide's exports. */
function toPascalCase(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/**
 * SERVER COMPONENT — deliberately not "use client".
 *
 * The `import * as Icons` barrel is what makes "any lucide icon name works"
 * possible, but it defeats tree-shaking: pulled into a client bundle it costs
 * ~60kB+. Keeping this on the server means the browser only ever receives the
 * handful of <svg> elements actually rendered. Callers in client components
 * receive the already-rendered element as a prop.
 */
export function ServiceIcon({ icon, className }: { icon: string | null; className?: string }) {
  const size = className ?? "h-5 w-5";

  if (isImageIcon(icon)) {
    return (
      <img
        src={icon!.trim()}
        alt=""
        aria-hidden="true"
        loading="lazy"
        className={`${size} shrink-0 rounded object-contain`}
      />
    );
  }

  const Component: LucideIcon = icon
    ? ((Icons as unknown as Record<string, LucideIcon>)[toPascalCase(icon)] ?? LayoutGrid)
    : LayoutGrid;

  return <Component aria-hidden="true" className={`${size} shrink-0 text-slate-400`} />;
}
