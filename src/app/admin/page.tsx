import { getMotd } from "@/lib/services";
import { MotdEditor } from "@/components/admin/MotdEditor";
import { Button, Field, Panel, inputClass } from "@/components/admin/ui";
import { getKumaConfig, getPortalIdentity, ACCENT_PRESETS } from "@/lib/settings";
import { updateIdentity } from "@/lib/actions/catalog";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminMotdPage() {
  const [motd, kuma, identity] = await Promise.all([
    getMotd(),
    getKumaConfig(),
    getPortalIdentity(),
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
              The current app icon. Save first to see a colour change here — and reinstall
              the app on your phone afterwards, since the home-screen icon is copied at
              install time and won&apos;t update on its own.
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
