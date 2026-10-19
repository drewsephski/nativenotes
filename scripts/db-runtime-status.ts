import "dotenv/config";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import postgres from "postgres";
import { resolveRuntimeDatabaseUrl } from "../src/config/database-url.js";

// Read-only. Never imports auth, migrates or prints connection credentials.
const url = resolveRuntimeDatabaseUrl(process.env);
const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 5 });
try {
  const journal = JSON.parse(
    await readFile("drizzle/meta/_journal.json", "utf8"),
  ) as { entries: { tag: string }[] };
  const applied = await sql<
    { hash: string }[]
  >`select hash from drizzle.__drizzle_migrations`;
  const hashes = new Set(applied.map((row) => row.hash));
  const missing: string[] = [];
  for (const { tag } of journal.entries) {
    const hash = createHash("sha256")
      .update(await readFile(`drizzle/${tag}.sql`, "utf8"))
      .digest("hex");
    if (!hashes.has(hash)) missing.push(tag);
  }
  const settings =
    await sql`select current_setting('statement_timeout') as statement_timeout, current_setting('lock_timeout') as lock_timeout, (select setting::integer from pg_settings where name = 'statement_timeout') as statement_timeout_ms, (select setting::integer from pg_settings where name = 'lock_timeout') as lock_timeout_ms`;
  console.log(
    JSON.stringify(
      {
        migrations: {
          expected: journal.entries.length,
          applied: applied.length,
          missing,
        },
        runtimeTimeouts: settings[0],
      },
      null,
      2,
    ),
  );
  if (missing.length) process.exitCode = 1;
  if (process.argv.includes("--require-timeouts")) {
    const row = settings[0];
    if (
      !row ||
      Number(row.statement_timeout_ms) <= 0 ||
      Number(row.statement_timeout_ms) > 10_000 ||
      Number(row.lock_timeout_ms) <= 0 ||
      Number(row.lock_timeout_ms) > 3000
    ) {
      console.error(
        "Runtime role timeout defaults are not effective on this connection. Configure them and recycle provider pool connections before releasing.",
      );
      process.exitCode = 1;
    }
  }
} finally {
  await sql.end({ timeout: 2 });
}
