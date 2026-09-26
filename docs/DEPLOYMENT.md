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

Entrypoint: root [`server.ts`](../server.ts). Vercel detects `server.ts` / `src/server.ts` and captures `server.listen()` ([Node.js runtime](https://vercel.com/docs/functions/runtimes/node-js)).

Routing stays in [`src/server/index.ts`](../src/server/index.ts). There is a single request listener; tests call `startNativeNotesServer()` from that module. Root `server.ts` exists so the entrypoint does not collide with the `src/server/` directory.

Local:

```sh
pnpm dev   # tsx watch server.ts
```

Deploy: connect the GitHub repo to Vercel, set environment variables, deploy. No Next.js. Optional minimal [`vercel.json`](../vercel.json) only sets `maxDuration` for the Node server entrypoint.

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
| `TRUSTED_ORIGINS` | Optional comma-separated extra origins |
| `NODE_ENV` | `development` \| `test` \| `production` |
| `PORT` | Local listen port (Vercel injects `PORT`) |

Production **requires HTTPS** for `BETTER_AUTH_URL` and `MCP_RESOURCE_URL`. Do not hardcode temporary `*.vercel.app` URLs in source; set them (or a custom domain) in the environment.

Conceptual production layout:

- `https://<domain>`
- `https://<domain>/api/auth` (issuer / Better Auth)
- `https://<domain>/mcp` (canonical MCP resource)

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
pnpm smoke:remote https://your-domain.com
```

Checks (no secrets):

- `GET /health`
- authorization server metadata (issuer = `{origin}/api/auth`)
- protected resource metadata (canonical `/mcp`, matching authorization server)
- JWKS
- anonymous `POST /mcp` → 401 Bearer

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
4. NativeNotes sign-in → consent → create/select Organization A
5. `pnpm seed:proof-notes <orgAId> [orgBId]`
6. ChatGPT tool scan → `note.list`
7. Prove refresh tenant stickiness, membership removal 403, optional Org B reconnect

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
