import "dotenv/config";
import postgres from "postgres";
import { resolveRuntimeDatabaseUrl } from "../src/config/database-url.js";
const sql = postgres(resolveRuntimeDatabaseUrl(process.env), {
  max: 1,
  prepare: false,
  connect_timeout: 5,
});
try {
  // Expired counters only. Does not remove notes, proposals or retry identities.
  const rows =
    await sql`delete from request_budgets where key in (select key from request_budgets where window_start < now() - interval '7 days' limit 10000) returning key`;
  console.log(`Removed ${rows.length} expired request budgets`);
} finally {
  await sql.end({ timeout: 2 });
}
