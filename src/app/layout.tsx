import type { Metadata, Viewport } from "next";
import { getPortalIdentity } from "@/lib/settings";
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
  const identity = await getPortalIdentity();

  return {
    title: identity.name,
    description: "Your services, in one place.",
    applicationName: identity.name,
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/api/icon/favicon", sizes: "64x64", type: "image/png" },
        { url: "/api/icon/512", sizes: "512x512", type: "image/png" },
      ],
      // iOS home-screen icon. PNG only — Safari ignores SVG here.
      apple: [{ url: "/api/icon/apple", sizes: "180x180", type: "image/png" }],
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
    themeColor: identity.accent,
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
      </body>
    </html>
  );
}
