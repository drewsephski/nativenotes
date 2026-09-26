import "dotenv/config";

import {
  assertSafeTestDatabaseUrl,
  resolveTestDatabaseUrlForSetup,
} from "../src/config/database-url.js";

/**
 * Vitest setup: force NODE_ENV=test and bind DATABASE_URL to TEST_DATABASE_URL.
 * Never inherit the developer/prod Neon DATABASE_URL for mutating tests.
 */
process.env.NODE_ENV = "test";

const testDatabaseUrl = resolveTestDatabaseUrlForSetup(process.env);
assertSafeTestDatabaseUrl(testDatabaseUrl, process.env);
process.env.DATABASE_URL = testDatabaseUrl;

process.env.BETTER_AUTH_SECRET ??=
  "local-development-secret-that-is-long-enough-123456";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.MCP_RESOURCE_URL ??= "http://localhost:3000/mcp";
process.env.TENANT_CLAIM_NAMESPACE ??= "https://nativenotes.example/claims";
process.env.PORT ??= "3000";
