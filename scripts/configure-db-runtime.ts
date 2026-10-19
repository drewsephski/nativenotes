import "dotenv/config";
import postgres from "postgres";
import {
  assertSafeTestDatabaseUrl,
  resolveRuntimeDatabaseUrl,
} from "../src/config/database-url.js";

// Explicit operational action, separate from schema migrations. Never runs on requests.
if (process.argv[2] !== "--apply")
  throw new Error(
    "Use --apply to set runtime-role timeouts for the configured database",
  );
const runtimeUrl = resolveRuntimeDatabaseUrl(process.env);
if (process.env.NODE_ENV === "test") assertSafeTestDatabaseUrl(runtimeUrl);
const runtime = new URL(runtimeUrl);
const direct = new URL(
  process.env.NODE_ENV === "test"
    ? runtimeUrl
    : (process.env.DATABASE_URL_UNPOOLED ?? runtimeUrl),
);
// Neon direct and pooled endpoints share credentials and differ by this suffix.
const hostname = (url: URL) => url.hostname.replace("-pooler.", ".");
if (
  hostname(runtime) !== hostname(direct) ||
  runtime.pathname !== direct.pathname
)
  throw new Error("Runtime and direct database targets differ");
if (direct.hostname.endsWith(".neon.tech")) direct.hostname = hostname(direct);
const role = decodeURIComponent(runtime.username);
const database = decodeURIComponent(runtime.pathname.slice(1));
if (!role || !database)
  throw new Error("Explicit runtime role and database required");
const sql = postgres(direct.href, {
  max: 1,
  prepare: false,
  connect_timeout: 5,
});
try {
  await sql`alter role ${sql(role)} in database ${sql(database)} set statement_timeout = '10s'`;
  await sql`alter role ${sql(role)} in database ${sql(database)} set lock_timeout = '3s'`;
  console.log(
    "Configured runtime role/database defaults. Existing pooled server connections may retain previous settings; recycle them through the provider, then verify pnpm db:status.",
  );
} finally {
  await sql.end({ timeout: 2 });
}
