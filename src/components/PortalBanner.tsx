import type { BannerHeight } from "@/lib/settings";

/**
 * Optional branding artwork across the top of the landing page.
 *
 * Height is the configured dimension and width follows the image's own aspect
 * ratio, capped at the content width. That way any shape of artwork stays
 * undistorted, and a very wide banner shrinks on a phone rather than overflowing.
 *
 * Purely decorative: alt is empty so a screen reader skips straight to the
 * greeting rather than announcing a logo the portal name already conveys.
 */
const HEIGHTS: Record<BannerHeight, string> = {
  sm: "h-10 sm:h-12",
  md: "h-16 sm:h-20",
  lg: "h-24 sm:h-32",
};

export function PortalBanner({ src, height }: { src: string | null; height: BannerHeight }) {
  if (!src) return null;

  return (
    // Centred via the wrapper rather than `mx-auto` on the image: the image is
    // width-auto, so there is no margin for auto to distribute.
    <div className="mb-5 flex justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- an admin-uploaded
          file on this origin; next/image would add a proxy for no benefit. */}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className={`${HEIGHTS[height]} w-auto max-w-full object-contain`}
      />
    </div>
  );
}
