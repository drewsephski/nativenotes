import { createHash } from "node:crypto";
import { sql } from "../db/client.js";

/** Atomic fixed windows in Postgres share limits across every serverless instance. */
export async function consumeRequestBudget(identity: string, limit: number) {
  const key = createHash("sha256").update(identity).digest("hex");
  const rows = await sql<{ count: number; retry_after: number }[]>`
    insert into request_budgets (key, window_start, count)
    values (${key}, date_trunc('minute', clock_timestamp()), 1)
    on conflict (key) do update set
      count = case when request_budgets.window_start < date_trunc('minute', clock_timestamp()) then 1 else least(request_budgets.count + 1, ${limit + 1}) end,
      window_start = date_trunc('minute', clock_timestamp())
    returning count, greatest(1, ceil(extract(epoch from (window_start + interval '1 minute' - clock_timestamp()))))::int as retry_after`;
  const row = rows[0];
  if (!row) throw new Error("Request budget unavailable");
  return { allowed: row.count <= limit, retryAfter: row.retry_after };
}
