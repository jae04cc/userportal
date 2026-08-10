# userportal

A self-hosted landing portal. Signed-in users get a personalised page listing the
services they're entitled to, each with live status from Uptime Kuma. Admins manage
everything from inside the app — no file edits, no redeploys.

## Features

- **Personalised landing page** — greeting by name, plus an admin-editable message of
  the day written in markdown.
- **Service directory** — cards grouped into categories, driven entirely by data.
- **Live status** — up / down / degraded / unknown from Uptime Kuma, refreshing every
  30s without a page reload. If Kuma is unreachable, cards fall back to `unknown`
  rather than erroring.
- **Role-based access, enforced server-side** — visibility is driven by group
  membership; admin surfaces are blocked on the server, not just hidden in the UI.
- **Admin area** — manage categories, services, groups, users, and the MOTD. Every
  change is recorded in an audit log.
- **Two sign-in paths** — Authentik (or any OIDC provider) with a local
  username/password fallback.

## Terminology

The two things the word "group" could mean are kept strictly separate:

- **Category** — a *display* heading service cards sit under ("Media", "Downloads").
- **Group** — an *access* group a user belongs to, which grants service visibility.

## Running locally

```bash
npm install
npm run dev      # http://0.0.0.0:5175
```

On first start the app creates its SQLite database, runs migrations, and prints a
bootstrap admin account to stdout:

```
  Username: admin
  Password: <generated>
```

Sign in with it, then change the password from **Account** — the portal nags until you
do, because that password is sitting in the server log.

`npm run dev` binds to `0.0.0.0` so a reverse proxy on the same network can reach it.

## Configuration

Almost everything is configured **in the admin UI** and stored in the database, so it
survives redeploys and takes effect immediately. Environment variables only seed
initial values or control things that must exist before the database is readable.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_PATH` | no | SQLite file. Defaults to `./data/userportal.db`. |
| `UPLOADS_DIR` | no | Uploaded service icons. Defaults to `./data/uploads`. |
| `AUTH_SECRET` | recommended | Session signing key. Auto-generated into the DB if unset; set it explicitly so sessions survive a database reset. |
| `AUTH_URL` | behind a proxy | The portal's public URL, e.g. `https://portal.example.com`. |
| `OIDC_ISSUER` | for SSO | e.g. `https://authentik.example.com/application/o/portal/` |
| `OIDC_CLIENT_ID` | for SSO | |
| `OIDC_CLIENT_SECRET` | for SSO | |
| `OIDC_DISPLAY_NAME` | no | Label on the SSO button. Defaults to "Single sign-on". |
| `LOCAL_LOGIN_ENABLED` | no | Set `false` to close the local login once SSO works. |
| `KUMA_BASE_URL` | no | Seeds the Kuma URL on first run; the admin UI takes over after. |
| `KUMA_STATUS_SLUG` | no | Same, for the status page slug. |

All three `OIDC_*` variables must be set for the SSO button to appear.

### Uptime Kuma

Configure this on **Admin → Monitoring**. It needs a **published** status page and its
slug (from `/status/<slug>`).

Kuma has no committed public REST API, so the portal reads the same status-page JSON
endpoints Kuma's own frontend uses. This is stable in practice but is not a contract —
if a Kuma upgrade changes them, status degrades to `unknown` and nothing else breaks.

**Import monitors** on the same page pulls everything from that status page in as
services, using Kuma's own groups as categories. Imported services arrive *disabled and
admin-only* with a placeholder URL, because the status page doesn't expose each
monitor's target URL — set the real URL on the Services tab, then enable it.

Services bind to a monitor's **numeric ID**, which survives renaming the monitor in
Kuma. A monitor name also resolves, for bindings typed by hand.

Kuma reports `UP`, `DOWN`, `PENDING`, and `MAINTENANCE` — it has no native "degraded".
`PENDING` (failing but still inside its retry budget) and `MAINTENANCE` both surface as
degraded. A heartbeat older than 10 minutes is treated as `unknown` rather than a
stale `up`.

### Authentik / OIDC

Register the portal as an OAuth2/OIDC provider in Authentik with redirect URI:

```
https://portal.example.com/api/auth/callback/oidc
```

First-time SSO users are auto-provisioned with no admin rights. Set a **default group**
on Admin → Groups so they don't land on an empty portal.

Existing local accounts are **never** auto-linked to an SSO identity by matching email —
that's an account-takeover vector if the IdP hands over an unverified address. An admin
links them deliberately by pasting the Authentik `sub` on Admin → Users.

## Deployment

```bash
docker compose up -d --build
```

Host port `3020` → container `3000`. Mount a volume at `/data` for the database and
uploaded icons. Put Pangolin (or any reverse proxy) in front and set `AUTH_URL` to the
public origin.

`GET /api/health` is an unauthenticated liveness probe that touches the database —
point an Uptime Kuma monitor at it so the portal watches itself.

## Architecture notes

- **`getVisibleServices()` in `src/lib/services.ts` is the only way service data is
  read.** The landing page and `/api/status` both go through it — if the status
  endpoint built its own list, it would leak the existence of admin-only services to
  normal users through their status payload.
- **The JWT carries only a user id.** Roles and group membership are read from SQLite
  on every request, so an admin changing someone's access takes effect on that user's
  next request rather than at their next sign-in. Suspending an account is immediate
  for the same reason.
- **Kuma is never awaited during page render.** The grid paints from SQLite; status
  arrives client-side after mount.
- **Status is cached server-side for 20s** and keyed by the current Kuma config, so a
  settings change isn't masked by a stale cache.
- **Service icons render on the server.** lucide's icon barrel is ~60kB and defeats
  tree-shaking; keeping it server-side means the browser receives only the `<svg>`
  elements actually used.

## Testing

```bash
npm test
```

Covers the visibility resolver (every mode × member/non-member × admin/non-admin) and
the Kuma parser (up/down/pending/maintenance/stale/malformed fixtures).

`scripts/seed-test-data.mjs` seeds a group, two non-admin users, and services at each
visibility level for manual RBAC checks.
