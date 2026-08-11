"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { StatusDot } from "./StatusDot";
import { ServiceModal } from "./ServiceModal";
import { cardStyle, type CardLayouts, type CardStyle } from "./cardStyles";
import { UNKNOWN, type MonitorHealth } from "@/lib/status/types";
import type { ServiceKind } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

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
        <section key={category.id} aria-labelledby={`cat-${category.id}`}>
          <h2
            id={`cat-${category.id}`}
            className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500"
          >
            {category.name}
          </h2>
          <div className={cn("grid gap-2 sm:gap-3", style.grid)}>
            {category.services.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                style={style}
                health={service.hasMonitor ? (statuses[service.id] ?? UNKNOWN) : null}
              />
            ))}
          </div>
        </section>
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
      // Status stays in the accessible name, since the visible word is gone.
      aria-label={label}
      className={shell}
    >
      {inner}
    </a>
  );
}
