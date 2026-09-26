import { migrate as runDrizzleMigrate } from "drizzle-orm/postgres-js/migrator";
import { pathToFileURL } from "node:url";

import { db, sql } from "./client.js";

export async function migrate(): Promise<void> {
  await runDrizzleMigrate(db, { migrationsFolder: "./drizzle" });
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  await migrate();
  await sql.end();
}
