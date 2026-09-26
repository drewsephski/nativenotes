import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

import { env } from "../config/env.js";
import * as authSchema from "./auth-schema.js";
import * as schema from "./schema.js";

export const sql = postgres(env.DATABASE_URL, {
  max: 10,
  prepare: false,
});

export const combinedSchema = { ...authSchema, ...schema };
export const db = drizzle(sql, { schema: combinedSchema });
