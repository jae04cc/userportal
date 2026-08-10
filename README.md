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

## Identity model

**Everyone except one account signs in through your identity provider.**

- **IdP users** are created automatically on first sign-in. They have no password,
  and nothing about them is editable in the portal — display name, email, groups, and
  admin rights are all mirrored from their token every time they sign in.
- **The bootstrap admin** is the single local username/password account. It exists so a
  broken IdP configuration can never lock you out. It keeps its admin rights regardless
  of what the IdP says, and it's the only account with a password to change.

Your IdP is the sole source of truth for authorization:

| Decision | Comes from |
|---|---|
| Who can sign in | The IdP |
| Which groups a user is in | The groups claim, replacing whatever the portal stored |
| Who is an admin | Membership of the configured admin group |
| Who is suspended | The portal (this is the one local override) |

A group named in someone's token is created in the portal the first time it's seen. To
scope a service to a group *before* anyone in it has signed in, create it by name on the
Groups tab — the name must match your IdP, matched case-insensitively.

The configured **default group** applies only when the IdP sends no groups at all. It is
never added alongside claimed groups, because it would then be silently re-applied on
every sign-in and contradict the IdP.

## Configuration

**There are no configuration environment variables.** Single sign-on, Uptime Kuma,
session lifetime, and the MOTD are all configured in the admin area and stored in the
database, so changes take effect immediately and survive redeploys.

Two variables are the only exceptions, because they can't live in the database — you
can't read the location of the database out of the database:

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_PATH` | `./data/userportal.db` | SQLite file |
| `UPLOADS_DIR` | `./data/uploads` | Uploaded service icons |

The session signing secret is generated once and stored in the database automatically.
The OIDC callback URL is derived from the incoming request, so it's correct behind a
reverse proxy without configuring a public URL anywhere.

On a brand-new database only, `KUMA_*` and `OIDC_*` environment variables are read once
to pre-fill the matching settings, so an existing env-configured deployment carries
over. After that the database is authoritative and the environment is ignored.

### Locked out?

If single sign-on breaks and you don't have the bootstrap password:

```bash
docker compose exec userportal node scripts/reset-admin.mjs   # or: npm run reset-admin
```

It prints a new password. Sign in at **`/login?local=1`** — the local form is hidden
behind a small link once SSO is configured, but it is never disabled.

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

Configure this on **Admin → Authentication**, which shows the exact redirect URI to
register in Authentik and validates the issuer's discovery document when you save.

You'll need: issuer URL, client ID, client secret, the name of the claim carrying
groups (usually `groups`), and the name of the Authentik group that grants portal admin.

Make sure Authentik actually emits the groups claim — without it, no user gets any
groups and nobody becomes an admin. The portal reads a claim that is an array of
strings, a single string, or a delimited string.

Identity is bound to the IdP's `sub`, never to a matching email address — auto-linking
on email is an account-takeover vector if the IdP ever hands over an unverified one.

**Session lifetime is how fast deprovisioning propagates.** Deleting someone in
Authentik stops them signing in again, but a JWT session can't be revoked server-side,
so an existing session stays valid until it expires. The default is 8 hours. Suspending
the account on Admin → Users cuts access on their very next request.

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

## Regenerating the lockfile

Use **npm 10**, not npm 11:

```bash
npx npm@10 install
```

npm 11 omits `"optional": true` on nested platform-specific packages (vitest's
`@esbuild/*`). A lockfile written that way makes `npm ci` fail on Linux with
`EBADPLATFORM`, because it treats `@esbuild/aix-ppc64` as a required dependency —
so CI and the Docker build break while everything still works locally on Windows.

To check a lockfile is healthy, every package with an `os`/`cpu` constraint should
carry `"optional": true` (excluding `libsql`, which genuinely supports the host).

## Testing

```bash
npm test
```

Covers the visibility resolver (every mode × member/non-member × admin/non-admin) and
the Kuma parser (up/down/pending/maintenance/stale/malformed fixtures).

`scripts/seed-test-data.mjs` seeds a group, two non-admin users, and services at each
visibility level for manual RBAC checks.
