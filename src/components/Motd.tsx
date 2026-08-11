import { Markdown } from "./Markdown";

/**
 * The admin-authored announcement banner.
 *
 * Rendering lives in <Markdown>, shared with popup and page cards, so all
 * admin-authored markdown behaves and looks identical — and raw HTML is
 * disabled in exactly one place.
 */
export function Motd({ markdown }: { markdown: string }) {
  if (!markdown.trim()) return null;

  return (
    <section
      aria-label="Announcement"
      className="rounded-lg border border-surface-border bg-surface-raised px-4 py-3"
    >
      <Markdown>{markdown}</Markdown>
    </section>
  );
}
