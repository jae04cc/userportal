import { NextResponse } from "next/server";
import { getPortalIdentity } from "@/lib/settings";
import { renderPortalIcon } from "@/lib/pwaIcon";

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
 */
const VARIANTS: Record<string, { size: number; padded: boolean }> = {
  "192": { size: 192, padded: false },
  "512": { size: 512, padded: false },
  "maskable-192": { size: 192, padded: true },
  "maskable-512": { size: 512, padded: true },
  apple: { size: 180, padded: false },
  favicon: { size: 64, padded: false },
};

export async function GET(_req: Request, { params }: { params: { variant: string } }) {
  const spec = VARIANTS[params.variant];
  if (!spec) return new NextResponse("Not found", { status: 404 });

  const identity = await getPortalIdentity();
  const png = renderPortalIcon(identity, spec.size, { padded: spec.padded });

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      // Short cache: the icon changes when an admin edits the portal identity,
      // and installed apps only re-read it occasionally anyway.
      "Cache-Control": "public, max-age=300",
    },
  });
}
