import { NextResponse } from "next/server";
import { getPortalIdentity } from "@/lib/settings";
import { renderPortalIcon } from "@/lib/pwaIcon";
import { getIconOverrides, readLogoFile } from "@/lib/branding";

export const dynamic = "force-dynamic";

/**
 * Every icon slot the app needs.
 *
 * Android wants a 192 and a 512, plus SEPARATE maskable entries — declaring one
 * icon as `"purpose": "any maskable"` gets it cropped as though it were
 * designed for masking, which eats the corners of artwork that wasn't.
 *
 * `apple` is 180x180 and unpadded: iOS applies its own rounded-rect mask and
 * ignores maskable padding. It must be a PNG — Safari ignores SVG here, which
 * is why an SVG-only setup gives no home-screen icon at all on an iPhone.
 *
 * `custom` is what an uploaded logo is allowed to take over:
 *   "png"  — an uploaded PNG of usable size is served verbatim
 *   "any"  — anything uploaded will do (browsers scale favicons happily)
 *   "none" — always generated. The maskable slots are here because serving an
 *            unpadded upload as maskable is exactly the crop this file warns
 *            about, and padding it would need a decoder we don't have.
 */
const VARIANTS: Record<string, { size: number; padded: boolean; custom: "png" | "any" | "none" }> = {
  "192": { size: 192, padded: false, custom: "png" },
  "512": { size: 512, padded: false, custom: "png" },
  "maskable-192": { size: 192, padded: true, custom: "none" },
  "maskable-512": { size: 512, padded: true, custom: "none" },
  apple: { size: 180, padded: false, custom: "png" },
  favicon: { size: 64, padded: false, custom: "any" },
};

// Short cache: the icon changes when an admin edits branding, and installed
// apps only re-read it occasionally anyway.
const CACHE_CONTROL = "public, max-age=300";

export async function GET(_req: Request, { params }: { params: { variant: string } }) {
  const spec = VARIANTS[params.variant];
  if (!spec) return new NextResponse("Not found", { status: 404 });

  if (spec.custom !== "none") {
    const overrides = await getIconOverrides();
    const takesOver = spec.custom === "any" ? overrides.favicon : overrides.app !== null;
    const logo = takesOver ? await readLogoFile() : null;

    if (logo) {
      return new NextResponse(new Uint8Array(logo.body), {
        headers: { "Content-Type": logo.contentType, "Cache-Control": CACHE_CONTROL },
      });
    }
  }

  const identity = await getPortalIdentity();
  const png = renderPortalIcon(identity, spec.size, { padded: spec.padded });

  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": CACHE_CONTROL },
  });
}
