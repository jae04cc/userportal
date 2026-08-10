import type { MetadataRoute } from "next";
import { getPortalIdentity } from "@/lib/settings";

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
  const identity = await getPortalIdentity();

  return {
    name: identity.name,
    short_name: identity.name,
    description: "Your services, in one place.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0b0f14",
    theme_color: identity.accent,
    icons: [
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
