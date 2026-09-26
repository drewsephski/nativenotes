# NativeNotes Deployment

Deployment foundation for NativeNotes: Neon Postgres + Vercel Node server. No Docker. Migrations are explicit. Product features (folders, embeddings, writes, etc.) are out of scope here.

## Neon

NativeNotes uses Neon as the canonical Postgres for development, test, and production.

| Environment | Neon approach | Connection |
| --- | --- | --- |
| development | Neon branch (often a `dev` branch, or shared non-prod) | Pooled `DATABASE_URL` |
| test | Dedicated `test` branch | `TEST_DATABASE_URL` (pooled) |
| production | Default/production branch | Pooled `DATABASE_URL` on Vercel |

Create a disposable test branch (once):

```sh
neon branch create --name test --project-id <project-id>
neon connection-string test --project-id <project-id> --pooled
```

Put the pooled string in `TEST_DATABASE_URL`. Put the production pooled string only in Vercel production env / local `DATABASE_URL` when intentionally targeting that branch.

### Pooled vs direct

- **Runtime (`DATABASE_URL`)**: Neon **pooled** URL (`-pooler` in the hostname). Required for Vercel Fluid / serverless so PgBouncer multiplexes connections.
- **Migrations (`DATABASE_URL_UNPOOLED`)**: Neon **direct** URL (no `-pooler`). Prefer this for `pnpm db:migrate` / `pnpm db:generate` credentials.

The app keeps `postgres` (postgres.js) + Drizzle. Do not switch drivers merely because Neon is in use. Runtime uses `prepare: false` and a tiny pool (`max: 1` in production) on a **module-level** client so isolates do not open a large pool per request.

## Vercel

NativeNotes uses **two** Vercel projects. Do not migrate the Node backend into Next.js. Do not delete the existing backend project.

### Project A — NativeNotes backend

Entrypoint: root [`server.ts`](../server.ts). Vercel detects `server.ts` / `src/server.ts` and captures `server.listen()` ([Node.js runtime](https://vercel.com/docs/functions/runtimes/node-js)).

Routing stays in [`src/server/index.ts`](../src/server/index.ts). There is a single request listener; tests call `startNativeNotesServer()` from that module. Root `server.ts` exists so the entrypoint does not collide with the `src/server/` directory.

- **Root directory:** repository root
- **Custom domain:** none required (keep the stable `*.vercel.app` hostname for rewrites)
- Optional minimal [`vercel.json`](../vercel.json) only sets `maxDuration` for the Node server entrypoint

Local:

```sh
pnpm dev   # tsx watch server.ts → http://localhost:3000
```

### Project B — NativeNotes web (public surface)

- **Root directory:** `apps/web`
- **Framework:** Next.js
- **Custom domain:** `nativenotes.app` (and `www` if used) — attach here only
- **Server-only env:** `NATIVE_NOTES_BACKEND_ORIGIN=https://nativenotes.vercel.app` (or the backend project’s stable production hostname)
  - Absolute `https://` origin
  - Must **not** be `https://nativenotes.app` (rewrite loop)
  - Never expose as `NEXT_PUBLIC_*`
- Leave `NEXT_PUBLIC_NATIVE_NOTES_API_URL` **unset** in production so the browser uses same-origin `https://nativenotes.app`

Local:

```sh
pnpm dev:web   # next dev → http://localhost:3001
```

External rewrites are defined in [`apps/web/next.config.ts`](../apps/web/next.config.ts) via [`apps/web/src/lib/backend-rewrites.ts`](../apps/web/src/lib/backend-rewrites.ts). Query strings are preserved. There is no blanket catch-all rewrite; Next retains `/`, `/app`, `/app/*`, and `_next/*`.

## Unified production routing

Steady-state topology: **public/product origin `https://nativenotes.app`** → Next.js (`apps/web`) → explicit external rewrites → **internal backend `https://nativenotes.vercel.app`** (repository root). The backend hostname is infrastructure, not product identity; it remains publicly reachable for Vercel rewrites and is protected by the existing auth/MCP controls. It is not a private network endpoint.

Canonical public domain: **https://nativenotes.app**. Attach the apex to the web project as a serving domain, with no redirect. If retaining `www.nativenotes.app`, attach it to the web project and redirect **www → apex**, never apex → www. The pre-cutover backend used www; that is historical configuration, not the target identity.

### Exact Vercel project setup

1. Keep the existing `nativenotes` backend project, root `.`, Node preset, install `pnpm install`, build `pnpm build`, Node 22.x. Keep `nativenotes.vercel.app` serving directly (no redirect to the public domain). Preserve its database, auth secret, Google credentials, and all backend settings.
2. Vercel → Add New → Project → import the same repository as **nativenotes-web**. Select **Next.js**, Root Directory **apps/web**, Node **22.x**, and enable **Include source files outside of the Root Directory** so the workspace lockfile is available. Install command `pnpm install --frozen-lockfile`; build command `pnpm build`; output directory stays the Next.js default.
3. Before the first web build, add `NATIVE_NOTES_BACKEND_ORIGIN=https://nativenotes.vercel.app` to **Production and Preview**. This is a build-time, server-only variable: changing it requires rebuilding the web deployment. Never put backend secrets or database URLs in the web project.
4. Remove `NEXT_PUBLIC_NATIVE_NOTES_API_URL` from web Production/Preview. Production browser code always uses `window.location.origin`, even if a stale override survives. Set `NEXT_PUBLIC_WEB_ORIGIN=https://nativenotes.app` for the server-rendering fallback.
5. Deploy and verify the preview's `/`, `/app`, `/health`, `/api/auth/get-session`, metadata, and Google start response. Before canonical cutover, metadata and Google's callback still name the **old** public origin; a preview is only a routing check, not full canonical-login proof. Do not add wildcard trusted origins to make preview login work.
6. After preview checks, move the domains to the web project. If apex currently redirects to www, Vercel requires moving **www first** and automatically moves its redirecting apex with it. Move www initially without a redirect, clear the apex redirect so apex serves Production, then set www → apex after the backend identity switch. This order avoids a redirect loop. Preserve the backend project and its stable Vercel hostname.
7. Set the four canonical backend values below together and redeploy backend immediately. Then complete public-origin smoke and interactive proof. A two-project issuer switch is not atomic: keep this interval short, do not initiate new OAuth flows during it, and reconnect existing clients afterward.

The root `.vercelignore` excludes local env files and build artifacts from CLI uploads. The web project has its own `apps/web/vercel.json`; from the repository root use `vercel deploy --project nativenotes-web --local-config apps/web/vercel.json` so the backend function configuration is not applied.

Project deployment protection must allow the web rewrite to reach backend routes and anonymous MCP discovery. Do not forward client-supplied bypass, tenant, or trusted-proxy headers. Rewrites only map the listed paths; authentication and tenant selection remain backend-owned.

References: [Vercel monorepos](https://vercel.com/docs/monorepos), [Next.js external rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites).

| Path | Serves |
| --- | --- |
| `/`, `/app`, `/app/*` | Next.js |
| `/sign-in`, `/sign-up`, `/sign-in/google` | Backend (rewrite) |
| `/oauth/consent` | Backend (rewrite) |
| `/api/auth/*`, `/api/notes`, `/api/notes/*` | Backend (rewrite) |
| `/.well-known/*`, `/mcp`, `/health` | Backend (rewrite) |

### Canonical backend identity (public domain)

Even though requests are physically proxied to the backend project, OAuth issuer / resource / redirects must advertise the public origin:

| Variable | Production value |
| --- | --- |
| `BETTER_AUTH_URL` | `https://nativenotes.app` |
| `MCP_RESOURCE_URL` | `https://nativenotes.app/mcp` |
| `TENANT_CLAIM_NAMESPACE` | `https://nativenotes.app/claims` |
| `TRUSTED_ORIGINS` | `https://nativenotes.app` |

The internal backend deployment URL must **never** appear in OAuth issuer metadata, protected resource metadata, user redirects, Google callback URLs (after cutover), or ChatGPT MCP configuration.

### Login intent

1. **OAuth/MCP** (`oauth_query` present): continue Better Auth authorize → consent → external client callback. Wins over `callbackURL`. Never divert to `/app` before OAuth completes.
2. **Web app** (trusted `callbackURL`): redirect there (typically `https://nativenotes.app/app`).
3. **Default**: `/app` (never `/`).

Trusted callbacks are restricted to `trustedOrigins` (open redirects rejected).

### Safe cutover order

1. Deploy updated backend while the old public URL still works.
2. Add Google authorized redirect URI `https://nativenotes.app/api/auth/callback/google` (keep the old `nativenotes.vercel.app` URI temporarily).
3. Create the web Vercel project (`apps/web`).
4. Set web `NATIVE_NOTES_BACKEND_ORIGIN` to the backend project hostname, then deploy (the build requires this env).
5. Verify a web preview with rewrites (`/health`, auth metadata, cookies).
6. Point `nativenotes.app` at the **web** project.
7. Update backend canonical `BETTER_AUTH_URL` / `MCP_RESOURCE_URL` / `TENANT_CLAIM_NAMESPACE` / `TRUSTED_ORIGINS` to `https://nativenotes.app`.
8. Redeploy backend.
9. Redeploy web if needed.
10. Run `pnpm smoke:remote https://nativenotes.app` and manual smoke (app login, ChatGPT MCP).
11. Reconnect ChatGPT using `https://nativenotes.app/mcp`.
12. Only after green: remove obsolete Google callback / ChatGPT config pointing at the backend hostname.

### Stop conditions

Stop and report (do not weaken security) if:

- external rewrites break `Set-Cookie`
- Google OAuth callback loses state
- ChatGPT OAuth redirects to `/app` prematurely
- OAuth metadata exposes the internal backend origin
- MCP resource/audience no longer matches
- production requires wildcard CORS
- a rewrite loop occurs
## Environment variables

See [`.env.example`](../.env.example).

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled Neon URL for app runtime |
| `DATABASE_URL_UNPOOLED` | Direct Neon URL for migrations |
| `TEST_DATABASE_URL` | Required for `pnpm test` DB work; must not be production |
| `PRODUCTION_DATABASE_URL` | Optional; strengthens the test safety guard |
| `BETTER_AUTH_SECRET` | ≥32 chars |
| `BETTER_AUTH_URL` | Canonical public origin (`https://<domain>`) |
| `MCP_RESOURCE_URL` | Canonical MCP resource (`https://<domain>/mcp`) |
| `TENANT_CLAIM_NAMESPACE` | Claim namespace (`https://<domain>/claims`) |
| `GOOGLE_CLIENT_ID` | Google OAuth Web client ID (Better Auth social provider) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Web client secret |
| `TRUSTED_ORIGINS` | Optional comma-separated extra origins |
| `NODE_ENV` | `development` \| `test` \| `production` |
| `PORT` | Local listen port (Vercel injects `PORT`) |

### Google OAuth redirect URIs

Better Auth 1.7.6 callback path (with `basePath: /api/auth`):

`{BETTER_AUTH_URL}/api/auth/callback/google`

| Environment | Authorized redirect URI |
| --- | --- |
| Local | `http://localhost:3000/api/auth/callback/google` |
| Production (canonical) | `https://nativenotes.app/api/auth/callback/google` |

Set the local + canonical URIs on the same Google Cloud OAuth Web client. The temporary backend callback `https://nativenotes.vercel.app/api/auth/callback/google` was removed after the committed main deployment passed verification (see release completion below). Without `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, the Google button is disabled and email/password remains available.

Account linking uses Better Auth defaults: a verified Google email matching an existing email/password user is linked to that user (`allowDifferentEmails` is not enabled).

Production **requires HTTPS** for `BETTER_AUTH_URL` and `MCP_RESOURCE_URL`. Configure the **public** domain (`https://nativenotes.app`), not the private backend rewrite hostname, as the canonical issuer/resource.

Conceptual production layout:

- `https://nativenotes.app` (Next.js)
- `https://nativenotes.app/app` (dashboard)
- `https://nativenotes.app/api/auth` (issuer / Better Auth via rewrite)
- `https://nativenotes.app/mcp` (canonical MCP resource via rewrite)

## Migrations

Migrations **must not** run on every Vercel request.

```sh
pnpm db:generate   # after schema changes
pnpm db:migrate    # apply explicitly (local, CI, or one-off against the target branch)
```

Recommended production flow:

1. Apply migrations to a Neon preview/test branch and run `pnpm test`.
2. Apply the same migrations to production with `DATABASE_URL_UNPOOLED` pointing at production direct.
3. Deploy the Vercel revision that expects that schema.

Do not add migrate-on-build to Vercel unless you have an explicit, reviewed pipeline; concurrent builds can race.

## Production OAuth URLs

Derived from `BETTER_AUTH_URL` / `MCP_RESOURCE_URL`:

| Discovery | Path |
| --- | --- |
| Authorization server metadata | `/api/auth/.well-known/oauth-authorization-server` |
| Protected resource metadata | `/.well-known/oauth-protected-resource` |
| JWKS | `/api/auth/jwks` |
| Authorize | `/api/auth/oauth2/authorize` |
| Token | `/api/auth/oauth2/token` |
| Consent UI | `/oauth/consent` |
| Sign in / sign up | `/sign-in`, `/sign-up` |
| Google social start | `POST /sign-in/google` → Better Auth `/api/auth/sign-in/social` |
| Google OAuth callback | `/api/auth/callback/google` |

Better Auth production settings in this repo:

- `trustedOrigins` includes the public origin (+ optional `TRUSTED_ORIGINS`)
- `advanced.useSecureCookies` when `NODE_ENV=production` or the auth URL is HTTPS
- JWT issuer = `{BETTER_AUTH_URL}/api/auth`
- MCP resource/audience = `MCP_RESOURCE_URL`
- CIMD profile `mcp-2026-07-28` with `@better-auth/cimd/node` protected fetch (no unrestricted client-metadata fetch)

## CIMD

Local OAuth lifecycle tests seed a public OAuth client because CIMD SSRF protection rejects loopback metadata hosts.

Production is ready for **remote** client metadata documents: Better Auth fetches public CIMD URLs over the Node protected transport. Do not hardcode ChatGPT-specific metadata in the repo.

### Production smoke plan (manual)

For each client (ChatGPT, Cursor, Claude Code):

1. Deploy NativeNotes with HTTPS `BETTER_AUTH_URL` / `MCP_RESOURCE_URL`.
2. Run `pnpm smoke:remote https://<domain>` (discovery + anonymous `/mcp` 401).
3. Register/connect the MCP server using the client's CIMD / OAuth flow against `https://<domain>/mcp`.
4. Complete consent with an organization selection.
5. Call `note.list` and confirm tenant scoping.
6. Refresh the token and confirm the tenant claim is unchanged.

## Smoke testing

```sh
pnpm smoke:remote https://nativenotes.app
```

Checks (no secrets):

- `GET /health`
- authorization server metadata (issuer = `{origin}/api/auth`)
- protected resource metadata (canonical `/mcp`, matching authorization server)
- JWKS
- anonymous `POST /mcp` → 401 Bearer
- when targeting `nativenotes.app`: metadata must not mention any `*.vercel.app` hostname
- redirects are rejected: apex-to-www cannot silently pass canonical smoke
- advertised JWKS URL and authorization/token endpoints use the public origin
- the MCP challenge points to reachable public protected-resource metadata

## Production MCP interoperability proof

Verified public metadata after cutover (`https://nativenotes.app`). No secrets or raw tokens are included.

| Item | Value |
| --- | --- |
| Canonical domain | `https://nativenotes.app` |
| Vercel deployment model | Root `server.ts` Node entrypoint, Fluid/serverless, `maxDuration: 60` |
| Preferred client | **ChatGPT** (CIMD). Cursor rejected: DCR/static-client only |
| CIMD discovery | NativeNotes advertises `client_id_metadata_document_supported: true`; DCR remains disabled |
| ChatGPT stable CIMD | `https://chatgpt.com/oauth/client.json` (expected with RFC 9207 support) |
| ChatGPT redirect | `https://chatgpt.com/connector_platform_oauth_redirect` |
| Token auth expectation | Intersection `none` ∪ `private_key_jwt`; ChatGPT singular preference → **`private_key_jwt`** |
| PKCE | S256 required and advertised |
| Resource / audience | `https://nativenotes.app/mcp` |

### Production discovery snapshot (actual)

Authorization server (`GET /api/auth/.well-known/oauth-authorization-server`):

- `issuer`: `https://nativenotes.app/api/auth`
- `authorization_endpoint`: `…/api/auth/oauth2/authorize`
- `token_endpoint`: `…/api/auth/oauth2/token`
- `jwks_uri`: `…/api/auth/jwks`
- `code_challenge_methods_supported`: `["S256"]`
- `client_id_metadata_document_supported`: `true`
- `authorization_response_iss_parameter_supported`: `true`
- `token_endpoint_auth_methods_supported`: includes `none`, `private_key_jwt`
- `grant_types_supported`: includes `authorization_code`, `refresh_token`
- `scopes_supported`: `openid`, `offline_access`, `mcp:read`, `mcp:write`, `mcp:instructions`, `mcp:admin`
- `registration_endpoint`: absent (DCR disabled)

Protected resource (`GET /.well-known/oauth-protected-resource`):

- `resource`: `https://nativenotes.app/mcp`
- `authorization_servers`: `["https://nativenotes.app/api/auth"]`
- `bearer_methods_supported`: `["header"]`

Anonymous `POST /mcp` returns `401` with `WWW-Authenticate: Bearer resource_metadata="https://nativenotes.app/.well-known/oauth-protected-resource/mcp"`.

### ChatGPT setup checklist

1. `pnpm smoke:remote https://nativenotes.app`
2. `pnpm validate:chatgpt-cimd`
3. ChatGPT Developer Mode → custom MCP → `https://nativenotes.app/mcp` → OAuth/CIMD (not DCR)
4. NativeNotes sign-in (Google or email) → consent → create/select Organization A
5. `pnpm seed:proof-notes <orgAId> [orgBId]`
6. ChatGPT tool scan → `note.list`
7. Prove refresh tenant stickiness, membership removal 403, optional Org B reconnect

Grokbot / computer-use scenarios: [`docs/QA.md`](./QA.md).

### Vercel env for Google

Add to the Vercel project (Production + Preview as needed):

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Then redeploy. Never commit the secret.
See [`docs/AUTH-SPIKE.md`](AUTH-SPIKE.md#chatgpt-interoperability-proof) for the full matrix and interactive status.

### Cursor (rejected)

Do **not** enable DCR to unblock Cursor. Do **not** seed a static OAuth client. Cursor remains incompatible with the CIMD-only policy.

## Rollback considerations

- **App rollback**: redeploy the previous Vercel deployment. Keep schema backward-compatible when possible.
- **Schema rollback**: prefer forward-fix migrations. If you must revert, restore a Neon branch / point-in-time branch and point `DATABASE_URL` at it; do not auto-migrate on deploy.
- **Auth misconfiguration**: fix `BETTER_AUTH_URL` / `MCP_RESOURCE_URL` / `BETTER_AUTH_SECRET` in Vercel env and redeploy. Rotating `BETTER_AUTH_SECRET` invalidates sessions and may require re-consent.

## What was removed

- Docker Compose local Postgres (Neon covers dev/test/prod)
- `@neon/config` / `@neon/env` / `neon.ts` / Neon Functions sample (`hello.ts`) — unused for this Vercel Node deployment path

## Cookies / CORS

Better Auth retains secure, HTTP-only, SameSite=Lax host-only cookies. No broad Domain setting or cross-subdomain cookie option is added. External rewrites must preserve each `Set-Cookie` header; the browser stores the cookie against `nativenotes.app`, and subsequent same-origin requests forward it to the backend. Inspect cookie attributes and `/api/auth/get-session` after login before declaring the cutover successful. Old www/backend-host cookies do not transfer; users must log in on apex.

Local development remains `http://localhost:3001` → `http://localhost:3000` with credentials and the existing explicit localhost CORS allowance. Production needs no CORS. CSRF/trusted mutation origins, DCR-disabled CIMD protected fetch, tenant grants, membership rechecks, and resource/audience checks remain unchanged.

## Required validation record

Run backend `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`; run web `pnpm --filter web lint`, `pnpm --filter web typecheck`, `pnpm --filter web test`, `pnpm --filter web build`. DB tests require the existing isolated `TEST_DATABASE_URL` guard; never substitute production.

After cutover, run `pnpm smoke:remote https://nativenotes.app`, then record these **separately** from automated tests:

- Signed-out `/app` → `/sign-in?callbackURL=https://nativenotes.app/app` → Google → public callback → `/app`.
- Direct `/sign-in` without callback → Google or email → `/app`.
- Session, workspace list, active workspace, note list, and a disposable note creation load correctly.
- Logout → login → `/app`; no stale session or cross-origin browser calls.
- ChatGPT connects to public `/mcp` → discovery → authorize → Google → consent → workspace selection → Approve → ChatGPT callback. No intermediate `/app` redirect. Re-run a tenant-scoped tool call.
- Public cookies stay host-only, Secure, HttpOnly; OAuth state survives Google's round trip; no internal hostname in metadata or redirects.

Issuer, audience, and claim namespace migration invalidates old client assumptions and tokens. Reconnect ChatGPT; do not accept the old audience or weaken validation. Keep the old Google callback configured until all checks pass. For rollback restore the previous domain ownership/redirect and all four backend canonical values together, using the recorded prior deployment. Do not rotate `BETTER_AUTH_SECRET`, delete the backend project, or change Neon as part of routing rollback.

## Cutover execution status — 2026-09-26

- Backend lint/typecheck/build and **101 tests** passed; web lint/typecheck/build and **44 tests** passed. OAuth lifecycle covers real Better Auth signed state/callback handling with only upstream Google token/profile responses mocked.
- Vercel capacity was freed; `nativenotes-web` was created with root `apps/web`, Next.js, and the server-only backend rewrite origin. Apex and www belong to the web project; apex serves directly and www redirects to apex. Backend retains only its stable Vercel hostname.
- Canonical backend production deployment: `dpl_5eFZgg2XEkGUp9Y4EejggjxorRUT`. Web production deployment: `dpl_3LPHUDiLqEHjSuU4eJiYqgGWtpNN`. The compatible pre-cutover backend `dpl_CuiPgLfGVP87rQnJiHZZkLXv7ZgG` remains available for coordinated rollback.
- All four backend canonical identity variables now use apex. Strict `pnpm smoke:remote https://nativenotes.app` passes health, issuer, PRM, JWKS, and anonymous MCP challenge checks. Metadata from both public and backend hosts advertises apex, never the rewrite hostname.
- Live Dia browser proof: signed-out `/app` returns through Google to `/app`; direct `/sign-in` without callback returns through Google to `/app`; logout and fresh login work; session, workspace selection, note loading, and note creation succeed. Google state cookies preserve Secure/HttpOnly/SameSite=Lax with no Domain through rewrites.
- Browser QA found that a fresh session's first membership was incorrectly displayed as active. The selector now requires an actual active organization and lets the user select the first workspace. Backend organization and MCP grant logic are unchanged.
- Browser QA also found a pre-existing schema mismatch: checked-in backend queries `notes.version`, but production had not applied `0002_previous_kingpin.sql`. With explicit user approval, that exact additive migration and its Drizzle journal record were applied together on the production branch. Existing notes were preserved. No new editing implementation was added.
- Created the labeled note `Production routing smoke check — 2026-09-26` to verify same-origin production writes and persistence across logout/login.
- ChatGPT canonical replacement **NativeNotes App** connects to `https://nativenotes.app/mcp`. Live signed-out authorization went through Google and consent; backend logs confirm consent submit/redirect, token exchange 200, and authenticated MCP discovery/tool listing with apex issuer and audience. The ChatGPT read-only check confirmed the production smoke note exists. The old **NativeNotes** connector still points at the backend hostname; its stale reconnect was not approved. Retain it only for rollout reference and remove it during cleanup; use **NativeNotes App** going forward.
- At the initial cutover, old Google callback entries were temporarily retained; the backend callback has since been removed (see release completion below). Old host sessions/tokens do not transfer to apex. No auth secret rotation, wildcard CORS, proxy-header trust, or old-audience exception was introduced.
- Backend logs warn that Better Auth cannot resolve a trusted client IP and uses a shared per-path rate-limit bucket. Leave this protection intact; a separate platform-aware rate-limit review is needed before introducing any proxy-header trust.
- Live email login was not exercised with the user's password; email intent and redirects are covered by HTTP route and database-backed lifecycle tests.

## Reproducible release and compatibility cleanup

The `Validate` GitHub workflow runs backend and web lint/typecheck/tests/build on Node 22 with pnpm 10.33.2 and an isolated PostgreSQL 18 service. CI has no production database or OAuth credentials. Review every PR check, including both Vercel projects, before merging. Vercel builds both projects from the merged main commit; verify each deployment's Git SHA and Ready state before running canonical smoke and browser checks.

Migration audit: all three production Drizzle hashes match their committed SQL files and journal timestamps. `0002_previous_kingpin.sql` adds `notes.version integer NOT NULL DEFAULT 1`; it is already applied and must not be edited or duplicated. Production columns/defaults/nullability and declared indexes were checked against `0002_snapshot.json`.

After the committed main deployment passes smoke, app Google login, workspace/notes, and a ChatGPT MCP read, remove the old Google backend callback from the existing OAuth client. Keep the canonical callback and the localhost callback if used. This changes provider configuration only; do not rotate credentials or invalidate the working grant.

**User-managed ChatGPT cleanup:** remove the old connector named **NativeNotes**. Retain **NativeNotes App**, pointing to `https://nativenotes.app/mcp`, and its existing working grant. Do not automate ChatGPT configuration changes.

For an ordinary release rollback, promote the last known-good backend and web deployments while retaining the apex canonical variables and domain ownership. The additive version migration remains compatible; do not drop the column. Restoring the pre-cutover identity is a separate coordinated rollback that also requires reinstating old provider callbacks and reconnecting clients.

### Release completion — 2026-09-26

- PR [#4](https://github.com/drewsephski/nativenotes/pull/4) merged as `ff96cd9b7479b9f2030916359ae89db13fa5c507` after all checks passed. Main CI also passed. Both production projects reached Ready on that exact commit: backend `dpl_BLyxn2JUiMt1ejiWi3YuYeoPx2Ub`, web `dpl_AxdaVQGw6qZWHS1CHmhdhdB4U21s`.
- Post-merge canonical smoke passed health, AS metadata, PRM, JWKS, anonymous MCP 401, public issuer/resource, and no internal hostname leakage. Fresh Google login returned to `/app`; workspace selection and notes loaded. The user independently confirmed a successful ChatGPT read using the existing **NativeNotes App** grant.
- Only after those checks, the old `https://nativenotes.vercel.app/api/auth/callback/google` redirect was removed from the Google OAuth client. Reopening the saved client confirmed its absence and retention of apex and localhost. The separately existing www callback and JavaScript origins were left unchanged; no credentials were rotated. Google warns provider changes can take minutes to hours to propagate.
- The old **NativeNotes** ChatGPT connector still needs user-managed removal. No ChatGPT configuration or working grant was changed programmatically.
