"use client";

import { useFormState, useFormStatus } from "react-dom";
import { saveOidcSettings, type ActionResult } from "@/lib/actions/authentication";
import { Button, Field, inputClass } from "./ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? "Saving and testing…" : "Save and test"}
    </Button>
  );
}

export function OidcSettingsForm({
  issuer,
  clientId,
  hasSecret,
  displayName,
  groupsClaim,
  adminGroup,
  defaultGroupId,
  sessionMaxAge,
  groups,
  callbackUrl,
  publicUrl,
}: {
  issuer: string;
  clientId: string;
  hasSecret: boolean;
  displayName: string;
  groupsClaim: string;
  adminGroup: string;
  defaultGroupId: string;
  sessionMaxAge: number;
  groups: Array<{ id: string; name: string }>;
  callbackUrl: string;
  publicUrl: string;
}) {
  const [state, formAction] = useFormState<ActionResult | null, FormData>(saveOidcSettings, null);

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field
          label="Portal public URL"
          htmlFor="publicUrl"
          hint={
            publicUrl
              ? "Pinned. Sign-in redirects use this address regardless of what the proxy sends."
              : "Optional. Leave blank to work it out from each request — set it if your reverse proxy rewrites the Host header, which makes sign-in redirect to an unreachable address."
          }
        >
          <input
            id="publicUrl"
            name="publicUrl"
            defaultValue={publicUrl}
            placeholder="https://portal.example.com"
            className={inputClass}
          />
        </Field>
      </div>

      <div className="sm:col-span-2 rounded-md border border-surface-border bg-surface-base p-3">
        <p className="text-xs text-slate-500">
          Redirect URI to register in your identity provider
          {publicUrl ? " (from the public URL above)" : " (from this request)"}:
        </p>
        <code className="mt-1 block break-all text-sm text-sky-300">{callbackUrl}</code>
      </div>

      <Field label="Issuer URL" htmlFor="issuer" hint="Authentik: the provider's OpenID configuration issuer.">
        <input
          id="issuer"
          name="issuer"
          defaultValue={issuer}
          placeholder="https://authentik.example.com/application/o/portal/"
          className={inputClass}
        />
      </Field>

      <Field label="Client ID" htmlFor="clientId">
        <input id="clientId" name="clientId" defaultValue={clientId} className={inputClass} />
      </Field>

      <Field
        label="Client secret"
        htmlFor="clientSecret"
        hint={hasSecret ? "A secret is stored. Leave blank to keep it." : "Required."}
      >
        <input
          id="clientSecret"
          name="clientSecret"
          type="password"
          autoComplete="off"
          placeholder={hasSecret ? "••••••••  (unchanged)" : ""}
          className={inputClass}
        />
      </Field>

      <Field label="Button label" htmlFor="displayName" hint="Shown on the login page.">
        <input
          id="displayName"
          name="displayName"
          defaultValue={displayName}
          placeholder="Single sign-on"
          className={inputClass}
        />
      </Field>

      <Field
        label="Groups claim"
        htmlFor="groupsClaim"
        hint="Token claim carrying group names. Usually 'groups'."
      >
        <input
          id="groupsClaim"
          name="groupsClaim"
          defaultValue={groupsClaim}
          placeholder="groups"
          className={inputClass}
        />
      </Field>

      <Field
        label="Admin group"
        htmlFor="adminGroup"
        hint="Members of this IdP group are portal admins. Case-insensitive."
      >
        <input
          id="adminGroup"
          name="adminGroup"
          defaultValue={adminGroup}
          placeholder="Portal Admins"
          className={inputClass}
        />
      </Field>

      <Field
        label="Default group"
        htmlFor="defaultGroupId"
        hint="Applied only when the IdP sends no groups at all."
      >
        <select
          id="defaultGroupId"
          name="defaultGroupId"
          defaultValue={defaultGroupId}
          className={inputClass}
        >
          <option value="">None</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Session lifetime"
        htmlFor="sessionMaxAge"
        hint="How long before users re-authenticate. This is how fast removing someone in your IdP takes effect."
      >
        <select
          id="sessionMaxAge"
          name="sessionMaxAge"
          defaultValue={String(sessionMaxAge)}
          className={inputClass}
        >
          <option value="3600">1 hour</option>
          <option value="28800">8 hours</option>
          <option value="86400">24 hours</option>
          <option value="604800">7 days</option>
          <option value="2592000">30 days</option>
        </select>
      </Field>

      {state ? (
        <p
          role="status"
          className={`sm:col-span-2 rounded-md border px-3 py-2 text-sm ${
            state.ok
              ? "border-emerald-900 bg-emerald-950/40 text-emerald-300"
              : "border-amber-900 bg-amber-950/40 text-amber-300"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <div className="sm:col-span-2">
        <SubmitButton />
        <p className="mt-2 text-xs text-slate-600">
          Clear the issuer and client ID and save to turn single sign-on off. The local bootstrap
          login always remains available.
        </p>
      </div>
    </form>
  );
}
