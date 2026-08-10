import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { readIcon } from "@/lib/uploads";

export const dynamic = "force-dynamic";

/**
 * Serves uploaded service icons. Requires a signed-in user — icons are part of
 * the portal's private surface and shouldn't be enumerable anonymously.
 */
export async function GET(_req: Request, { params }: { params: { file: string } }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });

  const icon = await readIcon(params.file);
  if (!icon) return new NextResponse("Not found", { status: 404 });

  // Buffer -> Uint8Array so it satisfies BodyInit under the DOM lib's types.
  return new NextResponse(new Uint8Array(icon.body), {
    headers: {
      "Content-Type": icon.contentType,
      // Content-addressed by a random name, so it can never change under a
      // given URL — safe to cache hard.
      "Cache-Control": "private, max-age=31536000, immutable",
      // Belt and braces for SVG: even though <img> never executes embedded
      // script, a direct navigation to this URL is fully sandboxed.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
