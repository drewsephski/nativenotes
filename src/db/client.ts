import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

import { resolveMaxConnections } from "../config/database-url.js";
import { env } from "../config/env.js";
import * as authSchema from "./auth-schema.js";
import * as schema from "./schema.js";

/**
 * Module-level client reused across requests in the same isolate.
 *
 * Neon pooled `DATABASE_URL` (hostname contains `-pooler`) multiplexes through
 * PgBouncer. Combined with a tiny postgres.js `max`, this avoids opening a
 * large pool per Vercel Fluid isolate. `prepare: false` is required for
 * PgBouncer transaction pooling.
 */
const max = resolveMaxConnections(env.NODE_ENV);

export const sql = postgres(env.DATABASE_URL, {
  max,
  prepare: false,
});

export const combinedSchema = { ...authSchema, ...schema };
export const db = drizzle(sql, { schema: combinedSchema });
