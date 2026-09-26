import { describe, expect, it } from "vitest";

import {
  assertAuthAndResourceOriginsAlign,
  assertProductionHttpsOrigin,
  assertSafeTestDatabaseUrl,
  isNeonPooledConnectionString,
  looksLikeProductionDatabase,
  resolveMaxConnections,
  resolveMigrationDatabaseUrl,
  resolveRuntimeDatabaseUrl,
  sameDatabaseTarget,
} from "../src/config/database-url.js";

const neonPooled =
  "postgresql://neondb_owner:secret@ep-example-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require";
const neonDirect =
  "postgresql://neondb_owner:secret@ep-example.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require";
const neonTestPooled =
  "postgresql://neondb_owner:secret@ep-test-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require";

describe("Neon DATABASE_URL helpers", () => {
  it("accepts pooled Neon connection strings", () => {
    expect(isNeonPooledConnectionString(neonPooled)).toBe(true);
    expect(isNeonPooledConnectionString(neonDirect)).toBe(false);
  });

  it("uses a conservative production pool size", () => {
    expect(resolveMaxConnections("production")).toBe(1);
    expect(resolveMaxConnections("test")).toBe(2);
    expect(resolveMaxConnections("development")).toBe(5);
  });

  it("resolves test runtime URL from TEST_DATABASE_URL only", () => {
    expect(
      resolveRuntimeDatabaseUrl({
        NODE_ENV: "test",
        TEST_DATABASE_URL: neonTestPooled,
        DATABASE_URL: neonPooled,
      }),
    ).toBe(neonTestPooled);

    expect(() =>
      resolveRuntimeDatabaseUrl({
        NODE_ENV: "test",
        DATABASE_URL: neonPooled,
      }),
    ).toThrow(/TEST_DATABASE_URL is required/);
  });

  it("keeps test migrations on TEST_DATABASE_URL even if unpooled prod is set", () => {
    expect(
      resolveMigrationDatabaseUrl({
        NODE_ENV: "test",
        TEST_DATABASE_URL: neonTestPooled,
        DATABASE_URL_UNPOOLED: neonDirect,
        DATABASE_URL: neonPooled,
      }),
    ).toBe(neonTestPooled);

    expect(
      resolveMigrationDatabaseUrl({
        NODE_ENV: "production",
        DATABASE_URL_UNPOOLED: neonDirect,
        DATABASE_URL: neonPooled,
      }),
    ).toBe(neonDirect);
  });
});

describe("production URL HTTPS requirements", () => {
  it("requires HTTPS origins in production", () => {
    expect(() =>
      assertProductionHttpsOrigin("http://notes.example.com", "BETTER_AUTH_URL"),
    ).toThrow(/must use HTTPS/);
    expect(() =>
      assertProductionHttpsOrigin(
        "https://notes.example.com",
        "BETTER_AUTH_URL",
      ),
    ).not.toThrow();
  });

  it("requires BETTER_AUTH_URL and MCP_RESOURCE_URL share one origin", () => {
    expect(() =>
      assertAuthAndResourceOriginsAlign(
        "https://www.nativenotes.app",
        "https://nativenotes.app/mcp",
      ),
    ).toThrow(/must match MCP_RESOURCE_URL origin/);
    expect(() =>
      assertAuthAndResourceOriginsAlign(
        "https://www.nativenotes.app",
        "https://www.nativenotes.app/mcp",
      ),
    ).not.toThrow();
  });
});

describe("test database safety guard", () => {
  it("refuses production Neon targets", () => {
    expect(
      looksLikeProductionDatabase(neonPooled, {
        NEON_BRANCH: "production",
        DATABASE_URL: neonPooled,
      }),
    ).toBe(true);

    expect(() =>
      assertSafeTestDatabaseUrl(neonPooled, {
        NEON_BRANCH: "production",
        DATABASE_URL: neonPooled,
      }),
    ).toThrow(/production database/);
  });

  it("allows a distinct test branch URL", () => {
    expect(() =>
      assertSafeTestDatabaseUrl(neonTestPooled, {
        NEON_BRANCH: "production",
        DATABASE_URL: neonPooled,
        TEST_DATABASE_URL: neonTestPooled,
      }),
    ).not.toThrow();

    expect(sameDatabaseTarget(neonPooled, neonTestPooled)).toBe(false);
  });

  it("can be explicitly bypassed", () => {
    expect(() =>
      assertSafeTestDatabaseUrl(neonPooled, {
        NEON_BRANCH: "production",
        DATABASE_URL: neonPooled,
        ALLOW_UNSAFE_DB_TESTS: "1",
      }),
    ).not.toThrow();
  });
});
