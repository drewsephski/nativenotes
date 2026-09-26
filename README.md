# NativeNotes

Backend-first foundation for a multi-tenant MCP notes service, inspired by Hjarni. This repository proves Better Auth OAuth/MCP, organization-bound tenant claims, membership revocation checks, and note APIs — with a **Next.js** public surface (`apps/web`) and an independently deployable **Node** backend (repo root).

Product features such as folders, tags, embeddings, pgvector, and revisions are intentionally not the focus of the routing cutover documented here.

## Requirements

- Node 20+
- pnpm
- A Neon project with:
  - pooled `DATABASE_URL` for runtime
  - direct `DATABASE_URL_UNPOOLED` for migrations
  - `TEST_DATABASE_URL` on a disposable Neon **test** branch for Vitest

Docker is not required.

## Local setup

```sh
cp .env.example .env
# Fill Neon URLs + BETTER_AUTH_SECRET (see docs/DEPLOYMENT.md)
pnpm install
pnpm db:migrate
pnpm dev            # backend http://localhost:3000
pnpm dev:web        # Next.js http://localhost:3001
```

Backend: health `/health`, MCP `/mcp`, auth UI `/sign-in`, `/sign-up`, consent `/oauth/consent`.

Web app: marketing `/`, signed-in shell `/app`. Locally the browser talks to the backend on `:3000` via `NEXT_PUBLIC_NATIVE_NOTES_API_URL` (CORS). In production the same paths are same-origin via Next.js rewrites.

Google OAuth (optional locally, required for production “Continue with Google”):

1. Create a Google Cloud OAuth **Web application** client.
2. Authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://nativenotes.app/api/auth/callback/google`
   - Temporary during rollout: `https://nativenotes.vercel.app/api/auth/callback/google`
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (see [`.env.example`](.env.example)).

The callback path is Better Auth’s default for basePath `/api/auth`: `/api/auth/callback/google` (better-auth 1.7.6).

```sh
pnpm check                                 # lint + typecheck + test + build (backend)
pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web test && pnpm --filter web build
pnpm test:oauth                            # OAuth lifecycle against TEST_DATABASE_URL
pnpm smoke:remote https://nativenotes.app  # post-cutover public origin
```

Computer-use / Grokbot scenarios: [`docs/QA.md`](docs/QA.md).

## Unified production routing

Public domain: **https://nativenotes.app** (Next.js web project).

The Node backend remains a separate Vercel project (stable internal hostname such as `https://nativenotes.vercel.app`). It is **not** given the custom domain. The web project proxies backend-owned paths with external rewrites driven by server-only `NATIVE_NOTES_BACKEND_ORIGIN`.

| Browser path | Owner |
| --- | --- |
| `/`, `/app`, `/app/*`, `_next/*` | Next.js |
| `/sign-in`, `/sign-up`, `/sign-in/google` | Backend (rewrite) |
| `/oauth/consent` | Backend (rewrite) |
| `/api/auth/*`, `/api/notes`, `/api/notes/*` | Backend (rewrite) |
| `/.well-known/*`, `/mcp`, `/health` | Backend (rewrite) |

Canonical auth identity (backend env — public domain, not the rewrite target):

- `BETTER_AUTH_URL=https://nativenotes.app`
- `MCP_RESOURCE_URL=https://nativenotes.app/mcp`
- `TENANT_CLAIM_NAMESPACE=https://nativenotes.app/claims`
- `TRUSTED_ORIGINS=https://nativenotes.app`

Login intent: `oauth_query` (MCP/ChatGPT) wins over trusted `callbackURL`; otherwise default `/app` (never `/`).

Full Vercel setup, cutover order, and smoke plan: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md#unified-production-routing).

## Environment

See [`.env.example`](.env.example), [`apps/web/.env.example`](apps/web/.env.example), and [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

Important:

- Runtime uses Neon **pooled** `DATABASE_URL` with `prepare: false` and a small module-level pool.
- Tests require `TEST_DATABASE_URL` and refuse to run against the configured production database.
- Production requires HTTPS `BETTER_AUTH_URL` and `MCP_RESOURCE_URL` on the **public** domain.
- Web production requires server-only `NATIVE_NOTES_BACKEND_ORIGIN` (backend Vercel origin). Do not set it to `nativenotes.app`.

## Migrations

Explicit only (never on Vercel request paths):

```sh
pnpm db:generate
pnpm db:migrate
```

Prefer `DATABASE_URL_UNPOOLED` when migrating.

## Vercel (two projects)

**Project A — NativeNotes backend** (do not delete):

- Root directory: repository root
- Entrypoint: [`server.ts`](server.ts)
- No public custom domain required
- Stable `*.vercel.app` hostname used only as rewrite target

**Project B — NativeNotes web**:

- Root directory: `apps/web`
- Framework: Next.js
- Custom domain: `nativenotes.app`
- Env: `NATIVE_NOTES_BACKEND_ORIGIN=https://<backend-vercel-host>` (server-only)

Details: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Auth spike notes: [`docs/AUTH-SPIKE.md`](docs/AUTH-SPIKE.md).

**CIMD clients:** NativeNotes is CIMD-only (DCR disabled). **ChatGPT** is the preferred interoperability target. Details: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md#production-mcp-interoperability-proof).

```sh
pnpm validate:chatgpt-cimd
pnpm seed:proof-notes <orgAId> [orgBId]
```
