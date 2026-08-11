"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { StatusDot } from "./StatusDot";
import { ServiceModal } from "./ServiceModal";
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

export type CardLayout = "detailed" | "compact";

const GRID_CLASS: Record<CardLayout, string> = {
  // Roomy rows: one per line on a phone, filling out as space allows.
  detailed: "grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(17rem,1fr))]",
  // Dense tiles: three across even on a phone.
  compact: "grid-cols-3 sm:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]",
};

export function ServiceGrid({
  categories,
  statuses,
  layout,
}: {
  categories: ClientCategory[];
  /** Supplied by LiveArea, which owns the single poll for the page. */
  statuses: Record<string, MonitorHealth>;
  layout: CardLayout;
}) {
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
          <div className={cn("grid gap-2 sm:gap-3", GRID_CLASS[layout])}>
            {category.services.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                layout={layout}
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
  layout,
}: {
  service: ClientService;
  health: MonitorHealth | null;
  layout: CardLayout;
}) {
  const [open, setOpen] = useState(false);
  const compact = layout === "compact";

  const shell = cn(
    "group relative rounded-lg border border-surface-border bg-surface-raised text-left transition-colors hover:border-slate-600 hover:bg-surface-hover",
    compact
      ? "flex min-h-[6rem] flex-col items-center justify-center gap-2 p-3 text-center"
      : "flex min-h-[5rem] items-center gap-3.5 p-3.5 sm:p-4"
  );

  const label = health ? `${service.name}, status: ${health.status}` : service.name;

  const inner = (
    <>
      {health ? <StatusDot health={health} className="absolute right-2.5 top-2.5" /> : null}

      {service.icon}

      {compact ? (
        <span className="line-clamp-2 text-xs font-medium leading-tight text-slate-100">
          {service.name}
        </span>
      ) : (
        // min-w-0 lets the text truncate instead of stretching the card, and
        // keeps the name and description sharing one left edge.
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-medium text-slate-100">
            {service.name}
          </span>
          {service.description ? (
            <span className="mt-0.5 block truncate text-sm text-slate-400">
              {service.description}
            </span>
          ) : null}
        </span>
      )}
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
