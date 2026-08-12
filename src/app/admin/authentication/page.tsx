import { headers } from "next/headers";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { groups } from "@/lib/db/schema";
import { Panel } from "@/components/admin/ui";
import { OidcSettingsForm } from "@/components/admin/OidcSettingsForm";
import {
  getOidcConfig,
  getPublicUrl,
  getSetting,
  getSessionMaxAge,
  SETTING_KEYS,
} from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function AdminAuthenticationPage() {
  const [oidc, allGroups, defaultGroupId, sessionMaxAge, publicUrl] = await Promise.all([
    getOidcConfig(),
    db.select().from(groups).orderBy(asc(groups.name)),
    getSetting(SETTING_KEYS.defaultGroupId),
    getSessionMaxAge(),
    getPublicUrl(),
  ]);

  // A configured public URL wins, because that is exactly what sign-in will use.
  // Otherwise derive it from the request, which is right whenever the proxy
  // forwards the original host.
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = publicUrl ?? `${proto}://${host}`;
  const callbackUrl = `${origin}/api/auth/callback/oidc`;

  return (
    <>
      <Panel
        title="Single sign-on"
        description="Everyone except the bootstrap admin signs in through your identity provider. Changes take effect immediately."
      >
        <OidcSettingsForm
          issuer={oidc.issuer}
          clientId={oidc.clientId}
          hasSecret={Boolean(oidc.clientSecret)}
          displayName={oidc.displayName === "Single sign-on" ? "" : oidc.displayName}
          groupsClaim={oidc.groupsClaim}
          adminGroup={oidc.adminGroup}
          defaultGroupId={defaultGroupId ?? ""}
          sessionMaxAge={sessionMaxAge}
          groups={allGroups.map((g) => ({ id: g.id, name: g.name }))}
          callbackUrl={callbackUrl}
          publicUrl={publicUrl ?? ""}
        />
      </Panel>

      <Panel title="How access is decided">
        <ul className="space-y-2 text-sm text-slate-400">
          <li>
            <strong className="text-slate-200">Your identity provider is the source of truth.</strong>{" "}
            On every sign-in, the groups in the token replace whatever the portal had stored for that
            user. Group membership can&apos;t be edited in the portal.
          </li>
          <li>
            <strong className="text-slate-200">Groups appear automatically.</strong> A group named in
            the token is created here on first sight. To scope a service to a group before anyone in
            it has signed in, create it by name on the Groups tab — the name must match your IdP
            exactly.
          </li>
          <li>
            <strong className="text-slate-200">Admin comes from the admin group above.</strong> No
            other SSO user is an admin, whatever the portal previously stored.
          </li>
          <li>
            <strong className="text-slate-200">The bootstrap admin is exempt.</strong> It signs in
            with a local password and keeps its admin rights regardless of the IdP, so a broken
            configuration can never lock you out.
          </li>
          <li>
            <strong className="text-slate-200">Deleting someone in your IdP</strong> stops them
            signing in again, but an existing session stays valid until it expires. That&apos;s what
            the session lifetime controls; suspend the account on the Users tab to cut it immediately.
          </li>
        </ul>
      </Panel>
    </>
  );
}
