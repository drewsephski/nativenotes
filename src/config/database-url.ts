/**
 * Neon / Postgres URL helpers for runtime, migrations, and test safety.
 *
 * Runtime traffic should use a Neon pooled URL (`-pooler` hostname).
 * Migrations should prefer `DATABASE_URL_UNPOOLED` (direct) when available.
 */

export type DatabaseUrlEnv = {
  DATABASE_URL?: string;
  DATABASE_URL_UNPOOLED?: string;
  TEST_DATABASE_URL?: string;
  PRODUCTION_DATABASE_URL?: string;
  NEON_BRANCH?: string;
  NODE_ENV?: string;
  ALLOW_UNSAFE_DB_TESTS?: string;
};

export function normalizePostgresUrl(url: string): URL {
  return new URL(url.replace(/^postgres(ql)?:/i, "http:"));
}

export function isNeonPooledConnectionString(url: string): boolean {
  try {
    const hostname = normalizePostgresUrl(url).hostname;
    return hostname.includes("-pooler.");
  } catch {
    return false;
  }
}

export function databaseTargetKey(url: string): string {
  const parsed = normalizePostgresUrl(url);
  const database = parsed.pathname.replace(/^\//, "") || "postgres";
  return `${parsed.hostname.toLowerCase()}/${database.toLowerCase()}`;
}

export function sameDatabaseTarget(left: string, right: string): boolean {
  try {
    return databaseTargetKey(left) === databaseTargetKey(right);
  } catch {
    return false;
  }
}

/**
 * Conservative postgres.js pool sizes for Vercel Fluid / serverless.
 * Neon already multiplexes via PgBouncer on pooled endpoints; a large
 * per-isolate pool multiplies connections under scale-out.
 */
export function resolveMaxConnections(
  nodeEnv: "development" | "test" | "production",
): number {
  if (nodeEnv === "production") return 1;
  if (nodeEnv === "test") return 2;
  return 5;
}

export function resolveRuntimeDatabaseUrl(env: DatabaseUrlEnv): string {
  if (env.NODE_ENV === "test") {
    return resolveTestDatabaseUrlForSetup(env);
  }

  const url = env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }
  return url;
}

/** Used by Vitest setup before the app env module loads. */
export function resolveTestDatabaseUrlForSetup(env: DatabaseUrlEnv): string {
  if (env.TEST_DATABASE_URL?.trim()) return env.TEST_DATABASE_URL.trim();
  throw new Error(
    "TEST_DATABASE_URL is required for database tests. Point it at a disposable Neon test branch (or other non-production database), not production.",
  );
}

/**
 * Prefer Neon's direct (unpooled) URL for Drizzle migrations outside tests.
 * In test, always use TEST_DATABASE_URL so production direct URLs cannot leak in.
 */
export function resolveMigrationDatabaseUrl(env: DatabaseUrlEnv): string {
  if (env.NODE_ENV === "test") {
    if (env.TEST_DATABASE_URL?.trim()) return env.TEST_DATABASE_URL.trim();
    throw new Error(
      "TEST_DATABASE_URL is required for migrations when NODE_ENV=test",
    );
  }

  const unpooled = env.DATABASE_URL_UNPOOLED?.trim();
  if (unpooled) return unpooled;

  const url = env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL or DATABASE_URL_UNPOOLED is required for migrations",
    );
  }
  return url;
}

export function looksLikeProductionDatabase(
  url: string,
  env: DatabaseUrlEnv,
): boolean {
  const productionUrl =
    env.PRODUCTION_DATABASE_URL?.trim() ||
    (env.NEON_BRANCH === "production" ? env.DATABASE_URL?.trim() : undefined);

  if (productionUrl && sameDatabaseTarget(url, productionUrl)) {
    return true;
  }

  return false;
}

export function assertSafeTestDatabaseUrl(
  url: string,
  env: DatabaseUrlEnv = process.env,
): void {
  if (env.ALLOW_UNSAFE_DB_TESTS === "1") return;

  if (looksLikeProductionDatabase(url, env)) {
    throw new Error(
      "Refusing to run database tests against a production database. Set TEST_DATABASE_URL to a Neon test branch (or set ALLOW_UNSAFE_DB_TESTS=1 only for an intentional exception).",
    );
  }

  if (env.DATABASE_URL?.trim() && sameDatabaseTarget(url, env.DATABASE_URL)) {
    if (env.NEON_BRANCH === "production" || env.PRODUCTION_DATABASE_URL) {
      throw new Error(
        "Refusing to run database tests: TEST_DATABASE_URL matches DATABASE_URL while a production database is configured.",
      );
    }
  }
}

export function assertProductionHttpsOrigin(url: string, name: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS in production`);
  }
}
