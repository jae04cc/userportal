import { requireUser } from "@/lib/authz";
import { getVisibleServices, getMotd } from "@/lib/services";
import { Motd } from "@/components/Motd";
import { PortalHeader } from "@/components/PortalHeader";
import { ServiceGrid, type ClientCategory } from "@/components/ServiceGrid";
import { ServiceIcon } from "@/components/ServiceIcon";

// Group membership and admin edits must show up immediately, so this page is
// never statically cached.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser();

  // Both reads hit local SQLite and are fast. Uptime Kuma is deliberately NOT
  // awaited here — the grid must paint immediately and let status fill in
  // client-side, rather than blocking first paint on a possibly-slow upstream.
  const [categories, motd] = await Promise.all([getVisibleServices(user), getMotd()]);

  const clientCategories: ClientCategory[] = categories.map((category) => ({
    id: category.id,
    name: category.name,
    services: category.services.map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      // Rendered here on the server so lucide's icon barrel never reaches the
      // client bundle — the browser receives only the resulting <svg>.
      icon: <ServiceIcon icon={service.icon} />,
      url: service.url,
      // monitorKey itself is intentionally not serialised to the browser.
      hasMonitor: Boolean(service.monitorKey),
    })),
  }));

  return (
    <main id="main" className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <PortalHeader user={user} />
      <div className="space-y-8">
        {user.mustChangePassword ? (
          <p
            role="alert"
            className="rounded-lg border border-amber-900 bg-amber-950/40 px-4 py-3 text-sm text-amber-300"
          >
            This account still uses the generated bootstrap password, which is sitting in the server
            log.{" "}
            <a href="/account" className="font-medium underline">
              Change it now
            </a>
            .
          </p>
        ) : null}
        <Motd markdown={motd} />
        <ServiceGrid categories={clientCategories} />
      </div>
    </main>
  );
}
