import { getMotd } from "@/lib/services";
import { MotdEditor } from "@/components/admin/MotdEditor";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { Button, Field, Panel, inputClass } from "@/components/admin/ui";
import { getBranding, getKumaConfig, getPortalIdentity, ACCENT_PRESETS } from "@/lib/settings";
import { getIconOverrides, MIN_ICON_PX } from "@/lib/branding";
import { UPLOAD_LIMITS } from "@/lib/uploads";
import { updateBranding, updateIdentity } from "@/lib/actions/catalog";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminMotdPage() {
  const [motd, kuma, identity, branding, iconOverrides] = await Promise.all([
    getMotd(),
    getKumaConfig(),
    getPortalIdentity(),
    getBranding(),
    getIconOverrides(),
  ]);

  return (
    <>
      <Panel
        title="Portal identity"
        description="Sets the browser title, the home-screen name, and the generated app icon. Give a dev install a different name and colour so the two are distinguishable once installed."
      >
        <form action={updateIdentity} className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Portal name"
            htmlFor="portalName"
            hint="Shown in the browser tab and under the home-screen icon once installed."
          >
            <input
              id="portalName"
              name="portalName"
              defaultValue={identity.name}
              maxLength={40}
              required
              className={inputClass}
            />
          </Field>

          <Field label="Icon accent" htmlFor="portalAccent">
            <select
              id="portalAccent"
              name="portalAccent"
              defaultValue={identity.accent}
              className={inputClass}
            >
              {ACCENT_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex items-center gap-3 sm:col-span-2">
            {/* The actual generated icon, not a mock-up of it. */}
            <img
              src="/api/icon/192"
              alt=""
              aria-hidden="true"
              className="h-12 w-12 shrink-0 rounded-xl"
            />
            <span className="text-xs text-slate-600">
              The current app icon
              {iconOverrides.app ? " — currently your uploaded logo, so the accent above no longer affects it" : ""}
              . Save first to see a change here — and reinstall the app on your phone
              afterwards, since the home-screen icon is copied at install time and won&apos;t
              update on its own.
            </span>
          </div>

          <div className="sm:col-span-2">
            <Button type="submit" variant="primary">
              Save identity
            </Button>
          </div>
        </form>
      </Panel>

      <Panel
        title="Branding"
        description="Artwork shown at the top of the landing page. Both are optional — with neither set the portal shows just the greeting, exactly as before."
      >
        <form action={updateBranding} className="space-y-5">
          <div>
            <h3 className="mb-1 text-sm font-medium text-slate-300">Banner</h3>
            <p className="mb-3 text-xs text-slate-500">
              Wide artwork across the top of the landing page. It scales to fit the height you
              choose, so a wide, short image works best. Up to {UPLOAD_LIMITS.branding / 1024 / 1024}
              MB — but it loads on every visit, so smaller is faster.
            </p>
            <ImageUpload
              name="banner"
              initial={branding.banner}
              label="banner"
              previewClass="h-16 w-56"
            />
            <div className="mt-3 max-w-xs">
              <Field label="Banner height" htmlFor="bannerHeight">
                <select
                  id="bannerHeight"
                  name="bannerHeight"
                  defaultValue={branding.bannerHeight}
                  className={inputClass}
                >
                  <option value="sm">Small</option>
                  <option value="md">Medium</option>
                  <option value="lg">Large</option>
                </select>
              </Field>
            </div>
          </div>

          <div className="border-t border-surface-border pt-5">
            <h3 className="mb-1 text-sm font-medium text-slate-300">Logo</h3>
            <p className="mb-3 text-xs text-slate-500">
              A <strong>square PNG of at least {MIN_ICON_PX}px</strong> replaces the browser
              favicon and the installed app icon. It can optionally also sit beside the greeting.
            </p>
            <ImageUpload
              name="logo"
              initial={branding.logo}
              label="logo"
              previewClass="h-16 w-16"
            />

            <label className="mt-3 flex items-start gap-2 text-sm text-slate-400">
              <input
                type="checkbox"
                name="showLogoInHeader"
                defaultChecked={branding.showLogoInHeader}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                Show the logo beside the greeting
                <span className="mt-0.5 block text-xs text-slate-600">
                  Turn this off if your banner already includes the logo. The favicon and app
                  icon are unaffected either way.
                </span>
              </span>
            </label>

            <p className="mt-3 text-xs text-slate-600">
              {branding.logo === null
                ? "No logo set — the generated icon is in use."
                : iconOverrides.app
                  ? "This logo is in use as the favicon and app icon. It is served exactly as uploaded, with no resizing or padding, so leave a little space around the artwork: Android and iOS both crop app icons to their own shape."
                  : "This logo shows beside the greeting and as the favicon, but not as the app icon — that slot needs a PNG at least " +
                    MIN_ICON_PX +
                    "px on both sides, so the generated icon is still used there."}
            </p>
          </div>

          <Button type="submit" variant="primary">
            Save branding
          </Button>
        </form>
      </Panel>

      <Panel
        title="Message of the day"
        description="Shown at the top of every user's landing page. Saves take effect immediately."
      >
        <MotdEditor initial={motd} />
      </Panel>

      {!kuma.configured ? (
        <Panel
          title="Uptime monitoring not configured"
          description="Service cards will show no status until this is set."
        >
          <p className="text-sm text-slate-400">
            Point the portal at a <em>published</em> Uptime Kuma status page on the{" "}
            <Link href="/admin/monitoring" className="text-sky-400 underline">
              Monitoring tab
            </Link>
            . From there you can also import its monitors straight in as services.
          </p>
        </Panel>
      ) : null}
    </>
  );
}
