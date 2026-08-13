import { requireUser } from "@/lib/authz";
import { getBranding, getPortalIdentity } from "@/lib/settings";
import { InstallPrompt } from "@/components/InstallPrompt";
import { PortalBanner } from "@/components/PortalBanner";
import { PortalBody } from "@/components/PortalBody";
import { PortalHeader } from "@/components/PortalHeader";

// Group membership and admin edits must show up immediately, so this page is
// never statically cached.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser();
  const [branding, identity] = await Promise.all([getBranding(), getPortalIdentity()]);

  return (
    <main id="main" className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <PortalBanner src={branding.banner} height={branding.bannerHeight} />
      {/* The header logo is opt-out: a banner that already contains the mark
          shouldn't repeat it. Hiding it here has no effect on the favicon or
          the installed app icon, which read the setting directly. */}
      <PortalHeader user={user} logo={branding.showLogoInHeader ? branding.logo : null} />

      {user.mustChangePassword ? (
        <p
          role="alert"
          className="mb-6 rounded-lg border border-amber-900 bg-amber-950/40 px-4 py-3 text-sm text-amber-300"
        >
          This account still uses the generated bootstrap password, which is sitting in the server
          log.{" "}
          <a href="/account" className="font-medium underline">
            Change it now
          </a>
          .
        </p>
      ) : null}

      {/* Below the password warning: a nudge to install must never sit above
          something the user actually needs to act on. */}
      <InstallPrompt appName={identity.name} />

      <PortalBody viewer={user} />
    </main>
  );
}
