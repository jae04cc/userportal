import type { Metadata, Viewport } from "next";
import { getPortalIdentity } from "@/lib/settings";
import { getIconOverrides } from "@/lib/branding";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";

/**
 * Title and theme colour follow the configured identity, so two installs
 * (dev and production) are distinguishable in the browser, the app switcher,
 * and under the home-screen icon.
 *
 * The icon and manifest are generated — see app/icon.tsx, app/apple-icon.tsx
 * and app/manifest.ts. Next wires those into the document automatically, so
 * there are no icon paths declared here.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [identity, overrides] = await Promise.all([getPortalIdentity(), getIconOverrides()]);

  // An uploaded logo is served verbatim rather than resized, so `sizes` has to
  // describe the real file. Declaring 512x512 for a 256px upload makes browsers
  // pick it for a slot it can't fill and it renders soft. Likewise the favicon
  // drops its `type` when an upload takes it over, since that upload may be an
  // SVG rather than the generated PNG.
  const large = overrides.app
    ? { url: "/api/icon/512", sizes: `${overrides.app.width}x${overrides.app.height}`, type: "image/png" }
    : { url: "/api/icon/512", sizes: "512x512", type: "image/png" };

  const favicon = overrides.favicon
    ? { url: "/api/icon/favicon" }
    : { url: "/api/icon/favicon", sizes: "64x64", type: "image/png" };

  const apple = overrides.app
    ? { url: "/api/icon/apple", sizes: `${overrides.app.width}x${overrides.app.height}`, type: "image/png" }
    : { url: "/api/icon/apple", sizes: "180x180", type: "image/png" };

  return {
    title: identity.name,
    description: "Your services, in one place.",
    applicationName: identity.name,
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [favicon, large],
      // iOS home-screen icon. PNG only — Safari ignores SVG here.
      apple: [apple],
    },
    appleWebApp: {
      capable: true,
      // This is the name iOS shows under the home-screen icon.
      title: identity.name,
      statusBarStyle: "black-translucent",
    },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const identity = await getPortalIdentity();

  return {
    width: "device-width",
    initialScale: 1,
    // The portal is meant to feel like an app, not a document: pinching and
    // double-tapping while scrolling a grid of cards zoomed far more often by
    // accident than on purpose. Note this is only half the story — iOS Safari
    // ignores userScalable, so the behaviours it does honour (double-tap zoom
    // and the auto-zoom on focusing a small input) are handled in globals.css.
    maximumScale: 1,
    userScalable: false,
    themeColor: identity.themeColor,
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface-raised focus:px-3 focus:py-2 focus:text-sm"
        >
          Skip to content
        </a>
        {children}
        {/* Registers the worker that makes the app installable at all. */}
        <ServiceWorker />
      </body>
    </html>
  );
}
