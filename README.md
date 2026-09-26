# Hjarni Clone

Backend-first foundation for a self-hosted, multi-tenant MCP notes service. This repository currently proves the Better Auth OAuth/MCP boundary, organization-bound tenant claims, membership revocation checks, and the read-only `note.list` tool.

## Local setup

Requirements: Node 20+, pnpm, and Docker.

```sh
cp .env.example .env
pnpm install
docker compose up -d
pnpm db:migrate
pnpm dev
```

The server listens on `http://localhost:3000`. Health is available at `/health`; the protected MCP endpoint is `/mcp`. Run the complete local check with:

```sh
pnpm check
```

Better Auth's internal schema is generated with `pnpm auth:generate`; application and generated Better Auth migrations are created with `pnpm db:generate` and applied with `pnpm db:migrate`.
# nativenotes
