import { setTransactionTimeouts } from "../db/timeouts.js";
import { createHash, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { noteCreateRequests, notes, noteRevisions } from "../db/schema.js";
import { ProductError } from "../domain/product-inputs.js";

/** The key, note and initial revision commit together. Retry identities are never purged. */
export async function createNoteOnce(input: {
  tenantId: string;
  userId: string;
  clientId?: string;
  idempotencyKey: string;
  title: string;
  body: string;
  summary?: string | null;
}) {
  const hash = (value: unknown) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const requestKey = hash([
    input.tenantId,
    input.userId,
    input.clientId ?? null,
    input.idempotencyKey,
  ]);
  const requestHash = hash([input.title, input.body, input.summary ?? null]);
  return db.transaction(async (tx) => {
    await setTransactionTimeouts(tx);
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${requestKey}, 0))`,
    );
    const [prior] = await tx
      .select()
      .from(noteCreateRequests)
      .where(eq(noteCreateRequests.requestKey, requestKey));
    if (prior) {
      if (prior.requestHash !== requestHash)
        throw new ProductError(
          "idempotency_conflict",
          "This idempotency key was used for different content",
          409,
        );
      return prior.noteId;
    }
    const [note] = await tx
      .insert(notes)
      .values({
        id: randomUUID(),
        tenantId: input.tenantId,
        title: input.title,
        body: input.body,
        summary: input.summary,
        createdByUserId: input.userId,
      })
      .returning();
    if (!note) throw new Error("Failed to create note");
    await tx.insert(noteRevisions).values({
      id: randomUUID(),
      tenantId: note.tenantId,
      noteId: note.id,
      version: note.version,
      title: note.title,
      body: note.body,
      summary: note.summary,
      authorUserId: input.userId,
      createdAt: note.createdAt,
    });
    await tx.insert(noteCreateRequests).values({
      requestKey,
      requestHash,
      tenantId: input.tenantId,
      noteId: note.id,
    });
    return note.id;
  });
}
