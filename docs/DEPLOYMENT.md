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

Canonical public domain: **https://nativenotes.app** (or `www` — pick **one** host and use it everywhere).

### Apex vs www (required)

Vercel may attach both `nativenotes.app` and `www.nativenotes.app`. One must be primary; the other should 308 to it.

**Today’s backend project** currently redirects apex → `www.nativenotes.app`. Until that is reversed, production env must use **www** as the single public origin:

| Variable | Must match the Vercel primary host |
| --- | --- |
| `BETTER_AUTH_URL` | `https://www.nativenotes.app` |
| `MCP_RESOURCE_URL` | `https://www.nativenotes.app/mcp` |
| `TENANT_CLAIM_NAMESPACE` | `https://www.nativenotes.app/claims` |
| `TRUSTED_ORIGINS` | `https://www.nativenotes.app` (optionally also apex) |

Do **not** mix apex issuer with www resource (or the reverse). Smoke and boot both fail on that split.

Preferred long-term (matches docs that cite apex): in Vercel Domains, set `www` → redirect to `nativenotes.app`, then flip all four vars to apex and redeploy.

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
3. Create/deploy the web Vercel project (`apps/web`).
4. Set web `NATIVE_NOTES_BACKEND_ORIGIN` to the backend project hostname.
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
| Temporary during rollout | `https://nativenotes.vercel.app/api/auth/callback/google` |

Set the local + canonical URIs on the same Google Cloud OAuth Web client. Keep the temporary backend hostname URI only until cutover smoke is green, then remove it. Without `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, the Google button is disabled and email/password remains available.

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
- when targeting `nativenotes.app`: metadata must not mention `nativenotes.vercel.app`

## Production MCP interoperability proof

Recorded against production (`https://nativenotes.vercel.app`). No secrets or raw tokens are included.

| Item | Value |
| --- | --- |
| Canonical domain | `https://nativenotes.vercel.app` |
| Vercel deployment model | Root `server.ts` Node entrypoint, Fluid/serverless, `maxDuration: 60` |
| Preferred client | **ChatGPT** (CIMD). Cursor rejected: DCR/static-client only |
| CIMD discovery | NativeNotes advertises `client_id_metadata_document_supported: true`; DCR remains disabled |
| ChatGPT stable CIMD | `https://chatgpt.com/oauth/client.json` (expected with RFC 9207 support) |
| ChatGPT redirect | `https://chatgpt.com/connector_platform_oauth_redirect` |
| Token auth expectation | Intersection `none` ∪ `private_key_jwt`; ChatGPT singular preference → **`private_key_jwt`** |
| PKCE | S256 required and advertised |
| Resource / audience | `https://nativenotes.vercel.app/mcp` |

### Production discovery snapshot (actual)

Authorization server (`GET /api/auth/.well-known/oauth-authorization-server`):

- `issuer`: `https://nativenotes.vercel.app/api/auth`
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

- `resource`: `https://nativenotes.vercel.app/mcp`
- `authorization_servers`: `["https://nativenotes.vercel.app/api/auth"]`
- `bearer_methods_supported`: `["header"]`

Anonymous `POST /mcp` returns `401` with `WWW-Authenticate: Bearer resource_metadata="https://nativenotes.vercel.app/.well-known/oauth-protected-resource/mcp"`.

### ChatGPT setup checklist

1. `pnpm smoke:remote https://nativenotes.vercel.app`
2. `pnpm validate:chatgpt-cimd`
3. ChatGPT Developer Mode → custom MCP → `https://nativenotes.vercel.app/mcp` → OAuth/CIMD (not DCR)
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
