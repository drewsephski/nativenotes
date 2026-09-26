# NativeNotes

Backend-first foundation for a multi-tenant MCP notes service, inspired by Hjarni. This repository proves Better Auth OAuth/MCP, organization-bound tenant claims, membership revocation checks, and the read-only `note.list` tool — deployed on **Neon Postgres** + **Vercel Node**.

Product features such as folders, tags, embeddings, pgvector, revisions, and note writes are intentionally not implemented yet.

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
pnpm dev
```

The server listens on `http://localhost:3000` (root [`server.ts`](server.ts)). Health: `/health`. MCP: `/mcp`. Auth UI: `/sign-in`, `/sign-up`, consent: `/oauth/consent`.

Google OAuth (optional locally, required for production “Continue with Google”):

1. Create a Google Cloud OAuth **Web application** client.
2. Authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://nativenotes.vercel.app/api/auth/callback/google`
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (see [`.env.example`](.env.example)).

The callback path is Better Auth’s default for basePath `/api/auth`: `/api/auth/callback/google` (better-auth 1.7.6).

```sh
pnpm check          # lint + typecheck + test + build
pnpm test:oauth     # OAuth lifecycle against TEST_DATABASE_URL
pnpm smoke:remote https://nativenotes.vercel.app
```

Computer-use / Grokbot scenarios: [`docs/QA.md`](docs/QA.md).
## Environment

See [`.env.example`](.env.example) and [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

Important:

- Runtime uses Neon **pooled** `DATABASE_URL` with `prepare: false` and a small module-level pool.
- Tests require `TEST_DATABASE_URL` and refuse to run against the configured production database.
- Production requires HTTPS `BETTER_AUTH_URL` and `MCP_RESOURCE_URL`.

## Migrations

Explicit only (never on Vercel request paths):

```sh
pnpm db:generate
pnpm db:migrate
```

Prefer `DATABASE_URL_UNPOOLED` when migrating.

## Vercel

1. Import the GitHub repo into Vercel (Node server; no Next.js).
2. Set production env vars (`DATABASE_URL`, `BETTER_AUTH_*`, `MCP_RESOURCE_URL`, `TENANT_CLAIM_NAMESPACE`, …).
3. Point a custom domain at the project when available; set `BETTER_AUTH_URL` / `MCP_RESOURCE_URL` to that HTTPS origin (not a hardcoded preview URL in source).
4. Migrate production with `pnpm db:migrate` against the direct URL, then deploy.

Current production origin: `https://nativenotes.vercel.app` (canonical until a custom domain is attached).

Remote smoke: `pnpm smoke:remote https://nativenotes.vercel.app`.

**CIMD clients:** NativeNotes is CIMD-only (DCR disabled). **ChatGPT** is the preferred interoperability target (stable CIMD at `https://chatgpt.com/oauth/client.json`). Cursor currently supports MCP OAuth via DCR or static client credentials, not CIMD, and was correctly rejected. Details: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md#production-mcp-interoperability-proof) and [`docs/AUTH-SPIKE.md`](docs/AUTH-SPIKE.md#chatgpt-interoperability-proof).

```sh
pnpm validate:chatgpt-cimd   # SSRF-safe CIMD fetch + MCP 2026-07-28 validation
pnpm seed:proof-notes <orgAId> [orgBId]   # optional tenant notes for ChatGPT note.list
```

Details: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Auth spike notes: [`docs/AUTH-SPIKE.md`](docs/AUTH-SPIKE.md).
