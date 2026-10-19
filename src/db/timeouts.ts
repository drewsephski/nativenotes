import { sql } from "drizzle-orm";
import type { NoteTransaction } from "../repositories/note-repository.js";

/** SET LOCAL follows the transaction on PgBouncer; startup settings can be ignored. */
export async function setTransactionTimeouts(tx: NoteTransaction) {
  await tx.execute(sql`set local statement_timeout = '10s'`);
  await tx.execute(sql`set local lock_timeout = '3s'`);
}
