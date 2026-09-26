// Force local Postgres for tests. Do not inherit Neon/.env DATABASE_URL.
process.env.DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:55432/nativenotes";
process.env.BETTER_AUTH_SECRET =
  "local-development-secret-that-is-long-enough-123456";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.MCP_RESOURCE_URL ??= "http://localhost:3000/mcp";
process.env.TENANT_CLAIM_NAMESPACE ??= "https://nativenotes.example/claims";
process.env.NODE_ENV ??= "test";
process.env.PORT ??= "3000";
