import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";

/**
 * Renders the admin-authored announcement.
 *
 * react-markdown does not render raw HTML unless rehype-raw is added, which it
 * deliberately is not — so an admin account can't inject script into every
 * user's landing page. Only inline formatting, links, and lists render.
 */
export function Motd({ markdown }: { markdown: string }) {
  if (!markdown.trim()) return null;

  return (
    <section
      aria-label="Announcement"
      className="rounded-lg border border-surface-border bg-surface-raised px-4 py-3 text-sm leading-relaxed text-slate-300"
    >
      <div className="space-y-2 [&_a]:text-sky-400 [&_a]:underline [&_li]:ml-4 [&_li]:list-disc [&_strong]:text-slate-100">
        <ReactMarkdown
          remarkPlugins={[remarkBreaks]}
          components={{
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
          }}
        >
          {markdown}
        </ReactMarkdown>
      </div>
    </section>
  );
}
