import { Canvas, hexToRgb } from "@/lib/png";
import type { PortalIdentity } from "@/lib/settings";

const BACKGROUND = "#0b0f14";

/**
 * The app icon: a 2x2 grid of rounded squares in the portal's accent colour,
 * on the portal's own dark background.
 *
 * Deliberately geometric rather than lettered. Rendering text would need a font
 * rasteriser, and the obvious one (`next/og`) cannot load on Windows — see
 * src/lib/png.ts. Two installs are told apart by their accent colour and by the
 * name the OS prints under the icon, which is the label people actually read.
 *
 * `padded` produces the maskable variant. Android crops icons to whatever shape
 * the launcher uses and only guarantees the middle 80%, so artwork that reaches
 * the edges loses its corners.
 */
export function renderPortalIcon(
  identity: PortalIdentity,
  size: number,
  { padded = false }: { padded?: boolean } = {}
): Buffer {
  const canvas = new Canvas(size, size);
  // Full bleed, so a maskable crop never exposes transparency.
  canvas.fill(hexToRgb(BACKGROUND));

  const accent = hexToRgb(identity.accent);

  // The grid occupies this fraction of the icon; the maskable variant pulls in
  // to stay clear of the crop.
  const extent = size * (padded ? 0.46 : 0.62);
  const gap = extent * 0.14;
  const cell = (extent - gap) / 2;
  const half = cell / 2;
  const radius = cell * 0.28;
  const centre = size / 2;
  const offset = (cell + gap) / 2;

  const cells: Array<[number, number, number]> = [
    [centre - offset, centre - offset, 1],
    [centre + offset, centre - offset, 0.72],
    [centre - offset, centre + offset, 0.72],
    // The lightest cell gives the mark an orientation, so it doesn't read as a
    // featureless block at small sizes.
    [centre + offset, centre + offset, 0.45],
  ];

  for (const [cx, cy, alpha] of cells) {
    canvas.roundedRect(cx, cy, half, half, radius, accent, alpha);
  }

  return canvas.toPng();
}
