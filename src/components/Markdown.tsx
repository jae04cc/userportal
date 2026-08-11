import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import { cn } from "@/lib/utils";

/**
 * Renders admin-authored markdown — the MOTD, and the body of popup/page cards.
 *
 * Raw HTML is NOT rendered: rehype-raw is deliberately absent, so an admin
 * account can't inject script into every user's portal. Only inline formatting,
 * links, lists, headings, quotes and code render.
 *
 * Always rendered on the server. Callers in client components receive the
 * finished element as a prop, which keeps react-markdown out of the browser
 * bundle entirely.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  if (!children.trim()) return null;

  return (
    <div
      className={cn(
        "space-y-3 text-sm leading-relaxed text-slate-300",
        "[&_a]:text-sky-400 [&_a]:underline",
        "[&_strong]:text-slate-100",
        "[&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-slate-100",
        "[&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-slate-100",
        "[&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-slate-200",
        "[&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5",
        "[&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5",
        "[&_code]:rounded [&_code]:bg-surface-base [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-slate-200",
        "[&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-surface-base [&_pre]:p-3",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-surface-border [&_blockquote]:pl-3 [&_blockquote]:text-slate-400",
        "[&_hr]:border-surface-border",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkBreaks]}
        components={{
          a: ({ href, children: content }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {content}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
