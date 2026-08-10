"use client";

import type { ReactNode } from "react";
import { StatusDot } from "./StatusDot";
import { UNKNOWN, type MonitorHealth } from "@/lib/status/types";

/**
 * Client-side shape only. Two deliberate choices:
 *  - no monitorKey, so the browser never learns the monitoring topology
 *  - `icon` is an already-rendered element built on the server, which keeps
 *    lucide's icon barrel out of the client bundle entirely
 */
export type ClientService = {
  id: string;
  name: string;
  description: string | null;
  icon: ReactNode;
  url: string;
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
}: {
  categories: ClientCategory[];
  /** Supplied by LiveArea, which owns the single poll for the page. */
  statuses: Record<string, MonitorHealth>;
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
          <div className="card-grid">
            {category.services.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
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
}: {
  service: ClientService;
  health: MonitorHealth | null;
}) {
  const isExternal = /^https?:\/\//i.test(service.url);

  return (
    <a
      href={service.url}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
      // The status is part of the accessible name so it isn't colour-only and
      // isn't lost on a screen reader.
      aria-label={health ? `${service.name}, status: ${health.status}` : service.name}
      className="group flex flex-col gap-1.5 rounded-lg border border-surface-border bg-surface-raised p-3 transition-colors hover:border-slate-600 hover:bg-surface-hover sm:gap-2 sm:p-4"
    >
      <div className="flex items-center gap-2 sm:gap-2.5">
        {service.icon}
        <span className="truncate text-sm font-medium text-slate-100 sm:text-base">
          {service.name}
        </span>
      </div>

      {service.description ? (
        // Hidden on phones — at two columns there isn't room for it without the
        // cards becoming tall and unscannable.
        <p className="hidden line-clamp-2 text-sm text-slate-400 sm:block">{service.description}</p>
      ) : null}

      {/* Reserved height keeps the card from shifting when status arrives. */}
      <div className="mt-auto flex h-4 items-center pt-1">
        {health ? <StatusDot health={health} /> : null}
      </div>
    </a>
  );
}
