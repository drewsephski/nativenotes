# NativeNotes Auth and MCP Foundation Spike

This document records the greenfield foundation implemented in this repository. NativeNotes is inspired by Hjarni; it is not a Hjarni clone. It intentionally does not implement embeddings, pgvector, HNSW, hybrid search, RRF, folders, tags, revisions, wiki-links, or deduplication.

## Package versions

Exact versions installed in `package.json` and `pnpm-lock.yaml`:

- `better-auth` 1.7.6
- `@better-auth/mcp` 1.7.6
- `@better-auth/cimd` 1.7.6
- `@better-auth/oauth-provider` 1.7.6
- `@better-auth/drizzle-adapter` 1.7.6
- `@better-auth/core` 1.7.6 (direct for the installed Better Auth type surface)
- `@modelcontextprotocol/server` 2.1.0
- `@modelcontextprotocol/node` 2.1.0
- `drizzle-orm` 0.45.3
- `drizzle-kit` 0.31.11
- `zod` 4.6.5
- `jose` 6.2.12
- `vitest` 5.0.2
- TypeScript 5.9.3

The runtime was verified with Node 26.3.0 and pnpm 10.33.2; the project engine requirement is Node 20 or newer.

## Better Auth configuration

Runtime configuration is in `src/auth/auth.ts`:

```ts
emailAndPassword: { enabled: true },
socialProviders: {
  // When GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET are set:
  google: {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  },
},
plugins: [
  organization(),
  jwt({ jwt: { issuer: betterAuthIssuer } }),
  mcp({
    appName: "NativeNotes", // via betterAuth({ appName: "NativeNotes" })
    resource: env.MCP_RESOURCE_URL,
    resources: [env.MCP_RESOURCE_URL],
    scopes: ["openid", "offline_access", "mcp:read", "mcp:write", "mcp:instructions", "mcp:admin"],
    accessTokenExpiresIn: 900,
    refreshTokenExpiresIn: 2592000,
    refreshTokenReuseInterval: 30,
    extensions: [createGrantBindingExtension()],
    postLogin: {
      page: "/oauth/consent",
      shouldRedirect: async ({ scopes }) =>
        scopes.includes("mcp:read") && getSelectedOrganization() === undefined,
      consentReferenceId: /* selected org from ALS */,
    },
  }),
  cimd({
    fetchClientMetadataResource,
    metadataProfile: "mcp-2026-07-28",
  }),
]
```

### Google OAuth

- Provider: Better Auth built-in `socialProviders.google`
- Canonical production callback: `https://nativenotes.app/api/auth/callback/google`
- Temporary during rollout: `https://nativenotes.vercel.app/api/auth/callback/google` (remove after cutover)
- Local callback: `http://localhost:3000/api/auth/callback/google`
- App route `POST /sign-in/google` forwards to `/api/auth/sign-in/social` with `provider: "google"` and optional `oauth_query`
- OAuth Provider hooks store `oauth_query` in OAuth serverContext on `/sign-in/social`, so ChatGPT authorize state survives the Google round trip
- Post-login intent (`src/server/auth-redirect-intent.ts`): `oauth_query` > trusted `callbackURL` > `/app` (never `/`)
- Account linking: Better Auth defaults (enabled). Verified same-email Google accounts link to existing email/password users. `allowDifferentEmails` is not enabled.

### Auth / consent UI

Server-rendered HTML + CSS design tokens in `src/ui/` (no SPA framework). Pages: `/sign-in`, `/sign-up`, `/oauth/consent`. In production these are reached at `https://nativenotes.app/...` via Next.js external rewrites to the Node backend project. Grokbot anchors and scenarios: `docs/QA.md`.

`mcp()` already composes the OAuth Provider behavior. No separate `oauthProvider()` registration is used. `jwt()` is required for the signing keys and JWKS endpoint. The application uses the generated Better Auth Drizzle schema; Better Auth internal tables are not hand-created.

The current MCP plugin API does not expose a global `requirePKCE` option. The installed OAuth Provider metadata advertises `code_challenge_methods_supported: ["S256"]`, and its authorization-code path validates S256 challenges when supplied. The client metadata profile is MCP 2026-07-28 and DCR remains disabled by default.

The secure Node CIMD fetch implementation is imported from `@better-auth/cimd/node`. No unrestricted generic fetch is used for client metadata. Local lifecycle tests seed a public OAuth client in `oauth_client` because CIMD SSRF protection rejects loopback metadata hosts.

## OAuth endpoints

With the local values in `.env.example`:

- Authorization server metadata: `GET http://localhost:3000/api/auth/.well-known/oauth-authorization-server`
- Authorization: `GET http://localhost:3000/api/auth/oauth2/authorize`
- Token: `POST http://localhost:3000/api/auth/oauth2/token`
- Consent continuation: `POST http://localhost:3000/api/auth/oauth2/consent` (called by the custom consent UI via `auth.handler`)
- JWKS: `GET http://localhost:3000/api/auth/jwks`
- MCP consent UI: `GET/POST http://localhost:3000/oauth/consent`
- Local auth UI: `GET/POST /sign-in`, `GET/POST /sign-up`
- Google social start: `POST /sign-in/google`
- Google callback: `GET /api/auth/callback/google`

The authorization metadata observed locally advertises authorization-code, refresh-token, PKCE S256, the configured scopes, and `client_id_metadata_document_supported: true`.

## Protected resource metadata and canonical resource

The one canonical configurable MCP resource is `MCP_RESOURCE_URL`, which defaults locally to `http://localhost:3000/mcp`. It is used for:

- the MCP plugin's discovery configuration;
- authorization request resource validation;
- token resource/audience validation;
- `requireMcpAuth` resource validation; and
- the `AuthInfo.resource` value passed to the MCP SDK.

The protected resource metadata endpoint is:

`GET http://localhost:3000/.well-known/oauth-protected-resource`

It advertises the canonical resource and the Better Auth issuer `http://localhost:3000/api/auth`. A resource-specific challenge may point a client at `/.well-known/oauth-protected-resource/mcp`; Better Auth owns that behavior.

## Organization grant binding

Better Auth Organization is the tenant. The custom `/oauth/consent` route lists the signed-in user's organizations and requires an explicit organization selection. The selection is checked against Better Auth's organization membership API before consent continues. The active organization is not used as the grant authority; it is only updated as normal Better Auth session state after the explicit selection.

The selected organization is carried across the Better Auth consent continuation using an `AsyncLocalStorage` bridge scoped to that request. The MCP extension's `postLogin.consentReferenceId` returns that explicitly selected organization only. If no selection exists while `mcp:read` is requested, authorize redirects to the consent/postLogin page.

`postLogin.shouldRedirect` returns true only while ALS has no selection. Returning true unconditionally loops authorize ↔ postLogin forever.

Important implementation detail proven by the lifecycle harness: `auth.api.oauth2Consent(...)` does not provide `ctx.request`, and Better Auth's authorize continuation throws `request not found`. The consent route therefore calls the real HTTP consent endpoint through `auth.handler(Request)` while ALS is active.

The OAuth Provider source and types were inspected. The stable lifecycle identifier is Better Auth's OAuth `referenceId`:

1. `postLogin.consentReferenceId` supplies the selected organization ID.
2. Better Auth stores it as `oauth_consent.reference_id`.
3. Authorization-code issuance copies it into the authorization-code verification value (`verification.value` JSON `referenceId`).
4. Access-token and refresh-token issuance pass the same `referenceId` into the OAuth extension.
5. Refresh-token exchange reads `oauth_refresh_token.reference_id`, so it does not consult the user's current active organization.

The extension uses that `referenceId` as the organization binding, rechecks current membership, and persists an application-owned `oauth_grant_tenant` row. The application stable identifier is a SHA-256 of user, OAuth client, organization, resource, and normalized scopes. It is unique and is used to make the binding idempotent.

## Token claims and refresh behavior

The access-token extension emits:

- `${TENANT_CLAIM_NAMESPACE}/tenant_id`
- `${TENANT_CLAIM_NAMESPACE}/tenant_role`

The tenant claim comes from the persisted Better Auth `referenceId` and the application grant row. It is never derived from the active organization during refresh. A new authorization for Organization B produces a different binding and B claim; refreshing the original A grant keeps A.

## Tenant auth context

After Better Auth verifies the token, resource, issuer, and required `mcp:read` scope, every MCP request calls `buildAuthContext`:

```ts
type AuthContext = {
  userId: string;
  tenantId: string;
  scopes: string[];
  roles: string[];
};
```

`buildAuthContext` requires `sub`, the namespaced tenant claim, and `scope`, then performs a live Better Auth `member` lookup for `(userId, organizationId)`. Removing the membership therefore rejects the next request even when the JWT has not expired. A tenant claim alone is never sufficient.

Application repositories accept tenant identity from this verified context. MCP tool arguments do not contain a tenant ID.

## MCP transport

The server uses `@modelcontextprotocol/server` 2.1.0 with a stateless per-request handler:

- `POST /mcp`
- `createMcpHandler(..., { legacy: "reject", responseMode: "json" })`
- `requireMcpAuth` with the canonical resource, Better Auth issuer, JWKS URL, and required `mcp:read` scope
- no Redis and no MCP session store
- no stdio transport

The 2026-07-28 SDK v2 modern request path uses the `server/discover` handshake and request metadata in `params._meta`. Tool calls also require the `Mcp-Name` header to match `params.name`. The SDK's `initialize` method is legacy-era; strict `legacy: "reject"` correctly rejects it and other 2025-era traffic. GET and DELETE behavior is delegated to the SDK Node adapter; anonymous requests receive the OAuth bearer challenge before MCP dispatch.

## `note.list`

The only tool is `note.list`. It requires `mcp:read` through `requireMcpAuth`, receives no tenant argument, reads the verified `AuthContext`, and calls `NoteRepository.listByTenant(authContext.tenantId)`. The repository query includes `WHERE notes.tenant_id = <verified tenant>` and returns machine-friendly structured JSON.

No MCP write operation is implemented.

## Database schema

`src/db/auth-schema.ts` is generated by the installed Better Auth CLI. Application tables are in `src/db/schema.ts`:

- `notes`: `id`, `tenant_id`, `title`, `body`, `created_at`, `updated_at`, plus a tenant index.
- `oauth_grant_tenant`: `id`, `user_id`, `oauth_client_id`, `organization_id`, `resource`, `scopes`, `stable_grant_identifier`, timestamps, and `revoked_at`, plus uniqueness and lookup indexes.

There is no vector column. `pnpm auth:generate` generates Better Auth's schema and `pnpm db:generate` generates the combined Drizzle migration. Better Auth's CLI `migrate` command is for its built-in Kysely adapter, so this project uses the generated schema with Drizzle Kit and `pnpm db:migrate`.

## DPoP and CIMD

DPoP verification remains on Better Auth's `requireMcpAuth` path and is not required by this foundation; bearer tokens are the compatibility baseline. A DPoP-bound token is not intentionally converted into a plain bearer token by application code.

CIMD uses Better Auth's MCP 2026-07-28 profile and the package's Node SSRF-protected metadata fetch. Dynamic client registration is not enabled.

## Source-level findings

- `jwt()` is the supported signing/JWKS composition required by the current package.
- `mcp()` configures the OAuth Provider behavior; separate `oauthProvider()` registration is unnecessary.
- The OAuth Provider extension receives `referenceId`, client, scopes, resources, user, and auth context for access-token claims.
- OAuth consent, authorization-code, access-token, and refresh-token records preserve `referenceId` through the refresh flow.
- `customAccessTokenClaims` does not receive the OAuth client and is less suitable for this grant binding than the OAuth Provider extension.
- Organization plugin APIs are available at runtime, but the current TypeScript inference does not expose all organization/OAuth consent endpoints on `auth.api`; the custom consent route uses a narrow structural type at that boundary and still performs the runtime membership check.
- `auth.api.oauth2Consent` cannot complete authorize continuation without an HTTP `Request`; use `auth.handler`.

## Deployment-related auth notes

Production/runtime hosting is Neon + Vercel Node (`server.ts`). Auth behavior is unchanged: same Better Auth plugins, issuer (`{BETTER_AUTH_URL}/api/auth`), canonical `MCP_RESOURCE_URL`, CIMD Node fetch, and organization grant binding. Production hardens cookies (`useSecureCookies` when HTTPS / `NODE_ENV=production`) and requires HTTPS origins. See `docs/DEPLOYMENT.md`.

Local OAuth lifecycle tests still seed a DB OAuth client because CIMD rejects loopback metadata hosts. Production clients should use public CIMD URLs.

## End-to-end OAuth proof

Harness: `tests/oauth-lifecycle.test.ts` + `tests/oauth-harness.ts`, run with `pnpm test:oauth`.

Client strategy: direct HTTP + PKCE (no Playwright). Email/password creates a real Better Auth session. A public harness OAuth client is seeded in `oauth_client` / `oauth_client_resource` because local CIMD fetch cannot resolve loopback metadata URLs.

### Exact test flow

1. Migrate the Neon **test** branch pointed to by `TEST_DATABASE_URL`.
2. Start NativeNotes on `http://127.0.0.1:3310`.
3. Sign up a disposable user; create Organization A and Organization B; insert Note A / Note B.
4. Authorization-code + PKCE S256 against `/api/auth/oauth2/authorize` with `resource=MCP_RESOURCE_URL`.
5. Better Auth returns JSON `{ redirect: true, url }` for non-browser Accept headers; the harness follows those as well as HTTP 303s.
6. Consent page selects the organization; POST binds ALS and completes consent through `auth.handler`.
7. Exchange code at `/api/auth/oauth2/token`; decode JWT; call `/mcp` `note.list`.

Observed artifact snapshot: `docs/oauth-lifecycle-findings.json`.

### Organization A

- Access token `sub` = user.
- `${TENANT_CLAIM_NAMESPACE}/tenant_id` = Organization A.
- `aud` contains `MCP_RESOURCE_URL`.
- `scope` contains `mcp:read`.
- `note.list` returns Note A only.

### Active-org drift

After grant A existed, active organization was switched to B without reauthorization. Refresh of grant A still emitted tenant claim A. Hard invariant held.

### Organization B

Second authorization for the same user selected B. Token contained B; `note.list` returned B only; refresh of grant A remained A. Distinct `oauth_grant_tenant` rows existed for A and B.

### Membership removal

Deleting the Organization A membership left the JWT cryptographically valid, but `/mcp` returned:

```json
{ "error": "forbidden", "error_description": "Organization membership is no longer active" }
```

### Refresh rotation / reuse window

Configured `refreshTokenReuseInterval: 30`. Observed:

- Normal refresh rotation succeeded and kept tenant A.
- Immediate reuse of the previous refresh token within the 30s window returned HTTP 200 with a full token response; tenant binding remained A.

### Better Auth `referenceId` lifecycle (runtime/DB)

| Stage | Table / field | Observed |
| --- | --- | --- |
| Consent | `oauth_consent.reference_id` | Selected organization ID |
| Authorization code | `verification.value` JSON `referenceId` | Present while code is unconsumed; empty after exchange |
| Refresh token | `oauth_refresh_token.reference_id` | Same organization ID as consent |
| Access token claims | JWT extension | Same organization ID as `referenceId` |

### `oauth_grant_tenant`

For A and B, distinct rows matched user, OAuth client, organization, resource, scopes, stable grant identifier, and `revoked_at = null`.

### Security assertions

- `tenant_id` in `note.list` args does not change scoping.
- Cross-tenant notes do not appear in `note.list`.
- Anonymous `/mcp` → 401 bearer challenge.
- Consent for a non-member organization → 403.
- Stale membership → 403 as above.
- Invalid audience / missing `mcp:read` remain enforced by `requireMcpAuth` before handler dispatch.

## Deviations from the requested plan

- The installed MCP SDK's 2026-07-28 wire behavior uses `server/discover`; `initialize` is a legacy-era request and is rejected under `legacy: "reject"`.
- The installed MCP plugin does not expose a global `requirePKCE` setting. Its authorization metadata advertises S256 and the provider validates S256 authorization-code challenges; no undocumented option was added.
- Explicit consent organization selection is implemented as a small application route around Better Auth's consent continuation because the selected organization must be displayed and persisted as server-owned grant state.
- `oauth_grant_tenant` uses a deterministic application stable identifier derived from the Better Auth `referenceId` organization binding and grant tuple. Better Auth's own `referenceId` remains the lifecycle link across authorization and refresh.
- Local OAuth proof seeds a DB OAuth client instead of CIMD because `@better-auth/cimd/node` requires public-routable metadata hosts.
- Consent completion uses `auth.handler` rather than `auth.api.oauth2Consent` because authorize requires `ctx.request`.

## Current proof and remaining risks

Automated unit/integration tests cover transport boundaries, grant identity, membership checks, and tenant-scoped listing. `pnpm test:oauth` proves the interactive authorization-code + PKCE lifecycle against the Neon test database (`TEST_DATABASE_URL`), including A/B independent grants, active-org drift, membership revocation, and refresh reuse.

### Initial production deploy + remote smoke (historical, 2026-09-26)

- Deployed to Vercel (`nativenotes`, Node `server.ts`) at the internal backend deployment hostname.
- Neon production branch migrated explicitly (unpooled); Better Auth + app tables present; no drift vs local journal (`0000`, `0001`).
- Remote smoke against the then-public backend hostname passed (health, AS metadata issuer, PRM resource, JWKS, anonymous `/mcp` 401).
- Production metadata advertises CIMD (`client_id_metadata_document_supported: true`) and does **not** advertise a registration endpoint; probe `POST …/oauth2/register` returns `403 Client registration is disabled`.

### Production MCP interoperability proof (Cursor) — rejected path

Preferred first client was Cursor. Official Cursor MCP docs describe remote OAuth via **Dynamic Client Registration** or **static `auth.CLIENT_ID` / optional secret**, with fixed redirect URIs `https://www.cursor.com/agents/mcp/oauth/callback` and `http://localhost:8787/callback`. Cursor staff state CIMD is not supported and has no published timeline ([forum](https://forum.cursor.com/t/mcp-oauth-cimd-support-plans-and-timelines/148096)).

NativeNotes was configured in Cursor `mcp.json` as a URL-only remote entry (the then-public backend MCP endpoint) with **no** static client and **no** DCR enablement. A complete CIMD consent → tenant grant → refresh → membership revocation loop was **not** completed, because the client cannot present a CIMD `client_id` metadata document URL.

**Stop condition hit for Cursor:** do not enable DCR; do not seed a static client. ChatGPT is the preferred CIMD interoperability target instead.

## ChatGPT interoperability proof

Verified against current OpenAI docs ([plugins auth](https://developers.openai.com/plugins/build/auth)) and live production metadata on 2026-09-26. No secrets.

### OpenAI requirements (current)

- Protected resource metadata + `WWW-Authenticate` resource challenge
- Authorization server metadata with `client_id_metadata_document_supported: true`, PKCE `S256`, and token auth methods ChatGPT can use (`none` and/or `private_key_jwt`)
- Echo `resource` on authorize + token; bind into access-token audience
- RFC 9207 issuer identification: advertise `authorization_response_iss_parameter_supported: true` and return matching `iss` on success **and** error authorization redirects to unlock the stable ChatGPT callback / CIMD URL
- Prefer CIMD over DCR; do not require DCR when CIMD is chosen
- Stable CIMD when issuer identification is met: `https://chatgpt.com/oauth/client.json` with redirect `https://chatgpt.com/connector_platform_oauth_redirect`
- Otherwise callback-specific: `https://chatgpt.com/oauth/{callback_id}/client.json` and `https://chatgpt.com/connector/oauth/{callback_id}`

### NativeNotes production metadata audit (canonical cutover)

| Field | Production value | ChatGPT expectation |
| --- | --- | --- |
| `issuer` | `https://nativenotes.app/api/auth` | Must match PRM `authorization_servers[0]` |
| `authorization_endpoint` | `…/api/auth/oauth2/authorize` | Present |
| `token_endpoint` | `…/api/auth/oauth2/token` | Present |
| `jwks_uri` | `…/api/auth/jwks` | Present (EdDSA OKP key) |
| `code_challenge_methods_supported` | `["S256"]` | Required |
| `client_id_metadata_document_supported` | `true` | Required for CIMD path |
| `authorization_response_iss_parameter_supported` | `true` | Required for stable callback |
| `token_endpoint_auth_methods_supported` | includes `none`, `private_key_jwt` | Intersection with ChatGPT CIMD |
| `scopes_supported` | includes `openid`, `offline_access`, `mcp:read`, … | ChatGPT may request advertised OIDC scopes |
| `registration_endpoint` | **absent** | DCR stays disabled |
| PRM `resource` | `https://nativenotes.app/mcp` | Exact `resource=` value |
| PRM `authorization_servers` | `["https://nativenotes.app/api/auth"]` | Exact issuer match |

### RFC 9207 findings (Better Auth 1.7.6)

- Metadata advertises `authorization_response_iss_parameter_supported: true` (not faked).
- Source (`@better-auth/oauth-provider`): successful code redirects set `iss` via `getIssuer()`; error redirects to the client `redirect_uri` pass `iss` into `formatErrorURL` (access_denied, invalid_scope, PKCE failures, query validation, etc.).
- Issuer string equals `https://nativenotes.app/api/auth` with no trailing-slash mismatch vs PRM.
- Therefore ChatGPT should use the **stable** CIMD/callback pair, not callback-id mode.

### ChatGPT CIMD metadata (live)

Fetched `https://chatgpt.com/oauth/client.json`:

- `client_id`: `https://chatgpt.com/oauth/client.json`
- `client_name`: `ChatGPT`
- `redirect_uris`: `["https://chatgpt.com/connector_platform_oauth_redirect"]`
- `grant_types`: `authorization_code`, `refresh_token`
- `response_types`: `code`
- `token_endpoint_auth_method`: `private_key_jwt` (singular preference)
- `token_endpoint_auth_methods_supported`: `["none", "private_key_jwt"]`
- `token_endpoint_auth_signing_alg`: `RS256`
- `jwks_uri`: `https://chatgpt.com/oauth/jwks.json` (live RSA JWKS present)

`pnpm validate:chatgpt-cimd` fetches that URL through `@better-auth/cimd/node` (SSRF-protected) and runs `validateCimdMetadata(..., { metadataProfile: "mcp-2026-07-28" })`. Do not bypass SSRF protection.

### Token endpoint auth intersection

| Party | Methods |
| --- | --- |
| NativeNotes AS | `none`, `client_secret_basic`, `client_secret_post`, `private_key_jwt` |
| ChatGPT CIMD | `none`, `private_key_jwt` |
| Intersection | `none`, `private_key_jwt` |

OpenAI: when the singular CIMD preference is in the intersection, ChatGPT uses it. Singular preference is `private_key_jwt`, so **expected ChatGPT token auth is `private_key_jwt`** (not `none`). Better Auth CIMD accepts `private_key_jwt` with `jwks_uri` and verifies assertions. NativeNotes does not require adding private_key_jwt support; it is already advertised and implemented by Better Auth. DPoP algs are advertised; ChatGPT does not require DPoP for this CIMD path.

### ChatGPT connection procedure

1. Enable ChatGPT Developer Mode (Business/Enterprise admin settings).
2. Create custom MCP app / connector pointing at `https://nativenotes.app/mcp`, authentication **OAuth**, prefer **CIMD** (do not choose DCR).
3. Confirm management UI shows stable CIMD `https://chatgpt.com/oauth/client.json` and redirect `https://chatgpt.com/connector_platform_oauth_redirect` (expected because RFC 9207 is advertised and implemented).
4. Sign in on NativeNotes (Google preferred, email/password fallback) → create/select Organization A on `/oauth/consent` → approve.
5. Allow ChatGPT tool scan → invoke `note.list`.

Consent UI can create workspaces when none exist (auth-surface bootstrap for org-bound grants; not a notes product feature). Seed tenant notes with `pnpm seed:proof-notes <orgAId> [orgBId]` after orgs exist.

Computer-use QA checklist: `docs/QA.md`.

### Interactive proof status

| Step | Status |
| --- | --- |
| Metadata / CIMD / RFC 9207 / smoke | Verified (production + `pnpm validate:chatgpt-cimd`) |
| Polished auth/consent UI + Google OAuth provider wiring | Implemented in repo; requires `GOOGLE_CLIENT_*` on Vercel |
| ChatGPT authorize → Google → Org A consent → `note.list` | Pending production Google credentials + interactive ChatGPT session |
| Active-org drift refresh stays Org A | Pending interactive session (inspect `oauth_refresh_token.reference_id` / `oauth_grant_tenant` if refresh is opaque) |
| Membership removal → 403 | Pending interactive session |
| Independent Org B grant | Pending (document ChatGPT single-connector UI limit if present) |

Safe temporary logs (no tokens/codes/secrets): `[oauth]` stages (`consent_page`, `organization_created`, `consent_submit`, `consent_redirect` with `hasIss`) and `[mcp]` (`method`, `clientId`, `organizationId`, `issuer`, `audience`, `scopes`).

### Tool scan (`note.list`)

- Name: `note.list`
- Description emphasizes read-only, empty args, tenant from token only
- Output: structured JSON `{ notes: [{ id, title, body, createdAt, updatedAt }] }`
- No OpenAI-proprietary MCP metadata added

Remaining risks:

- CIMD clients need a public (non-loopback) metadata URL; production uses `@better-auth/cimd/node` to fetch those safely.
- Cursor (and any DCR-only client) cannot complete the intended remote CIMD flow until the client supports CIMD or product policy explicitly allows a different client-registration strategy.
- ChatGPT may prefer `private_key_jwt` over `none`; assertion verification depends on Better Auth fetching ChatGPT JWKS through the same protected transport.
- Authorization-code `referenceId` is only inspectable before code exchange.
- Auth failure responses intentionally return machine-readable JSON without stack traces; operators should rely on server logs for unexpected failures.
- Canonical public origin is `https://nativenotes.app` (Next.js + rewrites). Updating `BETTER_AUTH_URL`, `MCP_RESOURCE_URL`, and `TENANT_CLAIM_NAMESPACE` must happen together when rotating the public domain; the backend rewrite hostname must never become the issuer.
- Interactive ChatGPT Org A / refresh / membership / Org B proofs require a Developer Mode workspace and redeploy of consent/logging/tool-metadata changes.

## Unified production routing

The Next.js project (`apps/web`) owns **https://nativenotes.app**. The independently deployable root Node project remains the auth/MCP/notes implementation. An explicit external rewrite map proxies sign-in/up/Google, consent, auth API, notes API, well-known metadata, MCP, and health; Next owns the landing page, `/app`, and assets. Server-only `NATIVE_NOTES_BACKEND_ORIGIN` targets the stable backend Vercel hostname, never the public domain.

Backend canonical identity is `BETTER_AUTH_URL=https://nativenotes.app`, `MCP_RESOURCE_URL=https://nativenotes.app/mcp`, `TENANT_CLAIM_NAMESPACE=https://nativenotes.app/claims`, `TRUSTED_ORIGINS=https://nativenotes.app`. Earlier backend/www snapshots above are historical. Google must allow `https://nativenotes.app/api/auth/callback/google`; keep the old backend callback temporarily, then remove after green.

App-login intent: a trusted callback returns to the web app; absent/untrusted callbacks default to `/app`. MCP-login intent: signed `oauth_query` takes precedence over callbackURL. Email forwards it to Better Auth without an app callback. Google forwards it unchanged into Better Auth's signed OAuth serverContext, which the provider restores on `/api/auth/callback/google`. The social fallback also targets authorize when OAuth intent is present, never `/app`. Ordinary email response URLs cannot override the trusted callback resolver. Callback origins remain exactly restricted to trustedOrigins; credentials in callback URLs are rejected.

Cutover order: deploy compatible backend → register apex Google callback → create/configure/deploy web → verify preview rewrites → move apex to web → update all backend canonical values and redeploy → smoke → exercise app and ChatGPT separately → reconnect ChatGPT → remove old callback/config only after green. Full setup and cookie/CORS/rollback checks: [DEPLOYMENT.md](DEPLOYMENT.md#unified-production-routing). The issuer migration is not atomic and requires client reconnection; no old-audience acceptance is introduced.

Tests cover route-level email/Google intent and cookies plus existing OAuth/MCP tenant invariants. The database-backed lifecycle also exercises signed email OAuth continuation and Google state/callback restoration with only the upstream Google token/profile calls mocked. This is not live Google or ChatGPT completion proof; record actual production interactive results separately.

### Unified-origin live proof — 2026-09-26

The public apex cutover is deployed. Strict remote smoke passes with issuer `https://nativenotes.app/api/auth`, resource `https://nativenotes.app/mcp`, reachable JWKS, and anonymous MCP 401. Google app login, direct sign-in fallback, logout/login, workspace selection, note reads, and note creation were exercised in Dia.

ChatGPT's old connector retained the old backend URL/metadata, so a canonical replacement named **NativeNotes App** was connected to `https://nativenotes.app/mcp`. Live Google callback continued to consent (not `/app`); consent submission and redirect were followed by a successful token exchange and authenticated MCP discovery/tool listing and a successful `tools/call` (HTTP 200). Token claim diagnostics showed the public issuer/resource and selected workspace. ChatGPT then confirmed the labeled production smoke note via a read-only request: [List Note Existence](https://chatgpt.com/c/6ab8148c-30b0-83ea-a130-7c8c2b07304d).

Consent completed while browser validation was in progress; server lifecycle logs establish the callback/consent/token sequence. This is live completion proof, separate from the mocked upstream Google lifecycle tests. Live refresh/organization-drift and membership-revocation exercises remain separate follow-up checks; existing automated tenant-invariant tests pass. Email login is verified by automated route/lifecycle tests, not a live user password submission.

The production `notes.version` schema mismatch discovered during QA was resolved by applying the existing additive `0002_previous_kingpin.sql` migration with explicit user approval. No note-editing code was implemented for this routing task. The full deployment IDs, configuration, and rollback steps are in [DEPLOYMENT.md](DEPLOYMENT.md#cutover-execution-status--2026-09-26).
