"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { StatusDot } from "./StatusDot";
import { ServiceModal } from "./ServiceModal";
import { cardStyle, type CardLayouts, type CardStyle } from "./cardStyles";
import { UNKNOWN, type MonitorHealth } from "@/lib/status/types";
import type { ServiceKind } from "@/lib/db/schema";
import { isIosStandalone, isPlainClick, requestSafariHandoff } from "@/lib/externalLink";
import { cn } from "@/lib/utils";

/** The real browser, wired into the injectable seams requestSafariHandoff takes. */
const browserHandoff = {
  navigate: (url: string) => {
    window.location.href = url;
  },
  isHidden: () => document.hidden,
  addListener: (type: string, handler: () => void) =>
    document.addEventListener(type, handler, { once: true }),
  removeListener: (type: string, handler: () => void) =>
    document.removeEventListener(type, handler),
  setTimer: (fn: () => void, ms: number) => {
    window.setTimeout(fn, ms);
  },
};

/**
 * Client-side shape only. Three deliberate choices:
 *  - no monitorKey, so the browser never learns the monitoring topology
 *  - `icon` is an already-rendered element built on the server, keeping
 *    lucide's icon barrel out of the client bundle
 *  - `content` is likewise already-rendered markdown, keeping react-markdown
 *    on the server
 */
export type ClientService = {
  id: string;
  name: string;
  description: string | null;
  icon: ReactNode;
  kind: ServiceKind;
  url: string;
  content: ReactNode;
  hasMonitor: boolean;
};

export type ClientCategory = {
  id: string;
  name: string;
  /** Whether this section starts folded shut. A default, not a lock. */
  startCollapsed: boolean;
  services: ClientService[];
};

export function ServiceGrid({
  categories,
  statuses,
  layouts,
}: {
  categories: ClientCategory[];
  /** Supplied by LiveArea, which owns the single poll for the page. */
  statuses: Record<string, MonitorHealth>;
  layouts: CardLayouts;
}) {
  const style = cardStyle(layouts);

  if (categories.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-surface-border px-4 py-8 text-center text-sm text-slate-400">
        No services are available to you yet.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {categories.map((category) => (
        /**
         * A native <details> rather than React state: it collapses correctly
         * with JavaScript disabled, the heading is keyboard-operable for free,
         * and screen readers announce the expanded/collapsed state without any
         * aria wiring. `open` is the admin's configured default — the browser
         * takes over from the first click.
         */
        <details key={category.id} open={!category.startCollapsed} className="group/section">
          <summary
            className={cn(
              "mb-3 flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500",
              "rounded transition-colors hover:text-slate-300",
              // Safari draws its own triangle without this.
              "[&::-webkit-details-marker]:hidden"
            )}
          >
            {/* Rotates to point down when the section is open. */}
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 transition-transform group-open/section:rotate-90"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
            {category.name}
            <span className="font-normal normal-case tracking-normal text-slate-600">
              ({category.services.length})
            </span>
          </summary>

          <div className={cn("grid gap-2 pb-2 sm:gap-3", style.grid)}>
            {category.services.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                style={style}
                health={service.hasMonitor ? (statuses[service.id] ?? UNKNOWN) : null}
              />
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

function ServiceCard({
  service,
  health,
  style,
}: {
  service: ClientService;
  health: MonitorHealth | null;
  style: CardStyle;
}) {
  const [open, setOpen] = useState(false);

  const shell = cn(
    "group relative rounded-lg border border-surface-border bg-surface-raised transition-colors hover:border-slate-600 hover:bg-surface-hover",
    style.shell
  );

  const label = health ? `${service.name}, status: ${health.status}` : service.name;

  const inner = (
    <>
      {health ? <StatusDot health={health} className="absolute right-2.5 top-2.5" /> : null}

      {service.icon}

      <span className={style.body}>
        <span className={cn(style.name, "text-slate-100")}>{service.name}</span>
        {service.description ? (
          <span className={cn(style.description, "text-slate-400")}>{service.description}</span>
        ) : null}
      </span>
    </>
  );

  if (service.kind === "popup") {
    return (
      <>
        <button type="button" onClick={() => setOpen(true)} aria-label={label} className={shell}>
          {inner}
        </button>
        <ServiceModal
          open={open}
          onClose={() => setOpen(false)}
          title={service.name}
          description={service.description}
        >
          {service.content}
        </ServiceModal>
      </>
    );
  }

  if (service.kind === "page") {
    return (
      <Link href={`/info/${service.id}`} aria-label={label} className={shell}>
        {inner}
      </Link>
    );
  }

  const isExternal = /^https?:\/\//i.test(service.url);

  return (
    <a
      href={service.url}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
      /**
       * Only does anything inside an iOS Home Screen web app, where
       * target="_blank" opens an in-app browser with its own cookie jar rather
       * than reaching Safari. Everywhere else this returns immediately and the
       * link behaves exactly as it always has. See src/lib/externalLink.ts.
       */
      onClick={
        isExternal
          ? (event) => {
              if (!isPlainClick(event) || !isIosStandalone()) return;
              event.preventDefault();
              requestSafariHandoff(service.url, browserHandoff);
            }
          : undefined
      }
      // Status stays in the accessible name, since the visible word is gone.
      aria-label={label}
      className={shell}
    >
      {inner}
    </a>
  );
}
