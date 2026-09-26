import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate as runDrizzleMigrate } from "drizzle-orm/postgres-js/migrator";
import { pathToFileURL } from "node:url";
import postgres from "postgres";

import {
  assertSafeTestDatabaseUrl,
  resolveMigrationDatabaseUrl,
} from "../config/database-url.js";

/**
 * Migrations are an explicit CLI/CI action — never run on Vercel request paths.
 * Prefer DATABASE_URL_UNPOOLED (Neon direct) so session-level migration
 * statements are not subject to PgBouncer transaction pooling limits.
 */
export async function migrate(): Promise<void> {
  const url = resolveMigrationDatabaseUrl(process.env);
  const sql = postgres(url, { max: 1, prepare: false });
  const db = drizzle(sql);
  try {
    await runDrizzleMigrate(db, { migrationsFolder: "./drizzle" });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  if (process.env.NODE_ENV === "test")
    assertSafeTestDatabaseUrl(resolveMigrationDatabaseUrl(process.env));
  await migrate();
}
