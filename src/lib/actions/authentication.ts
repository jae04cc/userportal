"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { groups } from "@/lib/db/schema";
import { requireAdminApi } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import { normalizePublicOrigin, safeUrlOrNull } from "@/lib/urls";
import {
  SETTING_KEYS,
  setSettings,
  getOidcConfig,
  DEFAULT_GROUPS_CLAIM,
  DEFAULT_SESSION_MAX_AGE,
} from "@/lib/settings";

export type ActionResult = {
  ok: boolean;
  message: string;
  /**
   * Whether the settings reached the database. Saving also probes the issuer,
   * and a probe that fails is a warning about the identity provider rather than
   * a rejected save — the caller needs to tell those apart to know whether the
   * form still has unsaved edits.
   */
  saved?: boolean;
};

function refresh() {
  revalidatePath("/");
  revalidatePath("/login");
  revalidatePath("/admin", "layout");
}

function str(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

/**
 * Validates an issuer by fetching its OIDC discovery document. Catches the
 * common mistakes (wrong path, unreachable host, not actually an OIDC issuer)
 * before they turn into an opaque redirect failure.
 */
async function probeIssuer(issuer: string): Promise<ActionResult> {
  const base = issuer.replace(/\/+$/, "");
  const url = `${base}/.well-known/openid-configuration`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!res.ok) {
      return { ok: false, message: `${url} returned HTTP ${res.status}.` };
    }
    const doc = (await res.json()) as { authorization_endpoint?: string; issuer?: string };
    if (!doc.authorization_endpoint) {
      return { ok: false, message: `${url} isn't a valid OIDC discovery document.` };
    }
    return { ok: true, message: `Discovery OK — issuer is ${doc.issuer ?? base}.` };
  } catch (err) {
    return { ok: false, message: `Could not reach ${url}: ${(err as Error).message}` };
  }
}

export async function saveOidcSettings(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const actor = await requireAdminApi();

  const rawIssuer = str(form, "issuer");
  const clientId = str(form, "clientId");
  const submittedSecret = str(form, "clientSecret");
  const adminGroup = str(form, "adminGroup");
  const groupsClaim = str(form, "groupsClaim") || DEFAULT_GROUPS_CLAIM;
  const displayName = str(form, "displayName");
  const defaultGroupId = str(form, "defaultGroupId");

  // An unchecked checkbox sends nothing at all, so absence is "off".
  const singleLogout = form.get("singleLogout") !== null;

  const rawMaxAge = Number(str(form, "sessionMaxAge"));
  const sessionMaxAge = Number.isFinite(rawMaxAge) && rawMaxAge >= 300 ? rawMaxAge : DEFAULT_SESSION_MAX_AGE;

  // Validated and saved ahead of everything else, and on every path including
  // the disable branch below: it governs where sign-in redirects land, so it
  // must not be lost just because SSO is being turned off in the same submit.
  const rawPublicUrl = str(form, "publicUrl");
  const publicUrl = rawPublicUrl ? normalizePublicOrigin(rawPublicUrl) : "";
  if (publicUrl === null) {
    return { ok: false, message: "The portal public URL must be a full http:// or https:// address." };
  }
  // Saved on every path, including the disable branch below, for the same
  // reason as the public URL: these are preferences about the form as a whole,
  // and losing one because SSO was switched off in the same submit is a bug.
  await setSettings({
    [SETTING_KEYS.publicUrl]: publicUrl,
    [SETTING_KEYS.oidcSingleLogout]: singleLogout ? "true" : "false",
  });

  // Clearing issuer and client id turns SSO off; the local login remains.
  if (!rawIssuer && !clientId) {
    await setSettings({
      [SETTING_KEYS.oidcIssuer]: "",
      [SETTING_KEYS.oidcClientId]: "",
      [SETTING_KEYS.oidcClientSecret]: "",
    });
    await recordAudit({
      actor,
      action: "update",
      entityType: "user",
      summary: "Disabled single sign-on",
    });
    refresh();
    return { ok: true, message: "Single sign-on disabled." };
  }

  const issuer = safeUrlOrNull(rawIssuer);
  if (!issuer) return { ok: false, message: "The issuer must be a valid https:// URL." };
  if (!clientId) return { ok: false, message: "A client ID is required." };

  const current = await getOidcConfig();
  // A blank secret field means "leave it alone" — the form never round-trips the
  // stored secret to the browser.
  const clientSecret = submittedSecret || current.clientSecret;
  if (!clientSecret) return { ok: false, message: "A client secret is required." };

  if (defaultGroupId) {
    const exists = await db.query.groups.findFirst({ where: eq(groups.id, defaultGroupId) });
    if (!exists) return { ok: false, message: "That default group no longer exists." };
  }

  await setSettings({
    [SETTING_KEYS.oidcIssuer]: issuer,
    [SETTING_KEYS.oidcClientId]: clientId,
    [SETTING_KEYS.oidcClientSecret]: clientSecret,
    [SETTING_KEYS.oidcDisplayName]: displayName,
    [SETTING_KEYS.oidcGroupsClaim]: groupsClaim,
    [SETTING_KEYS.oidcAdminGroup]: adminGroup,
    [SETTING_KEYS.defaultGroupId]: defaultGroupId,
    [SETTING_KEYS.sessionMaxAge]: String(sessionMaxAge),
  });

  // The secret is deliberately never included in the audit summary.
  await recordAudit({
    actor,
    action: "update",
    entityType: "user",
    summary: `Updated single sign-on (issuer ${issuer}, admin group "${adminGroup || "none"}")`,
  });
  refresh();

  const probe = await probeIssuer(issuer);
  if (!probe.ok) return { ok: false, saved: true, message: `Saved, but: ${probe.message}` };

  return {
    ok: true,
    saved: true,
    message:
      `Saved. ${probe.message}` +
      (adminGroup ? "" : " No admin group is set, so no SSO user will be an admin yet."),
  };
}

export async function testOidcConnection(): Promise<ActionResult> {
  await requireAdminApi();
  const config = await getOidcConfig();
  if (!config.issuer) return { ok: false, message: "No issuer is configured yet." };
  return probeIssuer(config.issuer);
}
