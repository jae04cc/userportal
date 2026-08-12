import type { MetadataRoute } from "next";
import { getPortalIdentity } from "@/lib/settings";
import { getIconOverrides } from "@/lib/branding";

export const dynamic = "force-dynamic";

/**
 * Generated rather than static, so the name and icon colour follow the portal's
 * configured identity.
 *
 * That's what lets a dev and a production install sit side by side on a phone
 * without being indistinguishable: they're separate origins, so the OS already
 * treats them as separate apps — this just makes them *look* different.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const [identity, overrides] = await Promise.all([getPortalIdentity(), getIconOverrides()]);
  const logo = overrides.app;

  return {
    name: identity.name,
    short_name: identity.name,
    description: "Your services, in one place.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0b0f14",
    theme_color: identity.accent,
    icons: logo
      ? [
          // An uploaded logo is served verbatim, so it is declared at its real
          // measured size — Chrome selects an icon by its declared `sizes` and
          // a wrong value there gets the wrong icon picked.
          //
          // No maskable entry: the upload has no safe-zone padding, and an
          // Android launcher masking it would crop the corners off. Without a
          // maskable icon Android draws the logo on its own backing shape
          // instead, which leaves the artwork intact.
          {
            src: "/api/icon/512",
            sizes: `${logo.width}x${logo.height}`,
            type: "image/png",
            purpose: "any",
          },
        ]
      : [
          { src: "/api/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/api/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "/api/icon/maskable-192",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/api/icon/maskable-512",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
  };
}
