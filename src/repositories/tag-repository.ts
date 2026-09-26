import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { notes, noteTags, tags } from "../db/schema.js";
import { ProductError } from "../domain/product-inputs.js";

export async function listTags(tenantId: string) {
  return db.select({ id: tags.id, name: tags.name, normalizedName: tags.normalizedName,
    noteCount: sql<number>`count(${notes.id}) filter (where ${notes.archivedAt} is null and ${notes.trashedAt} is null)`.mapWith(Number),
  }).from(tags).leftJoin(noteTags, and(eq(noteTags.tenantId, tenantId), eq(noteTags.tagId, tags.id)))
    .leftJoin(notes, and(eq(notes.tenantId, tenantId), eq(notes.id, noteTags.noteId)))
    .where(eq(tags.tenantId, tenantId)).groupBy(tags.id).orderBy(tags.normalizedName);
}
export async function saveTag(tenantId: string, name: string, id?: string) {
  // Database lower() is the canonical normalization, including Unicode/collation.
  if (id) {
    const [tag] = await db.update(tags).set({ name, normalizedName: sql`lower(trim(${name}))` })
      .where(and(eq(tags.tenantId, tenantId), eq(tags.id, id))).returning();
    if (!tag) throw new ProductError("not_found", "Tag not found", 404);
    return tag;
  }
  const [tag] = await db.insert(tags).values({ id: randomUUID(), tenantId, name, normalizedName: sql`lower(trim(${name}))` }).returning();
  return tag!;
}
export async function assignTag(tenantId: string, noteId: string, tagId: string, remove = false) {
  // Verify both targets even for removal; never acknowledge a foreign object.
  const [note] = await db.select({ id: notes.id }).from(notes).where(and(eq(notes.tenantId, tenantId), eq(notes.id, noteId)));
  const [tag] = await db.select({ id: tags.id }).from(tags).where(and(eq(tags.tenantId, tenantId), eq(tags.id, tagId)));
  if (!note || !tag) throw new ProductError("not_found", "Note or tag not found", 404);
  if (remove) await db.delete(noteTags).where(and(eq(noteTags.tenantId, tenantId), eq(noteTags.noteId, noteId), eq(noteTags.tagId, tagId)));
  else await db.insert(noteTags).values({ tenantId, noteId, tagId }).onConflictDoNothing();
  return { ok: true };
}
export async function deleteTag(tenantId: string, id: string) {
  const deleted = await db.delete(tags).where(and(eq(tags.tenantId, tenantId), eq(tags.id, id))).returning({ id: tags.id });
  if (!deleted.length) throw new ProductError("not_found", "Tag not found", 404);
  return { ok: true };
}
export async function mergeTag(tenantId: string, id: string, intoId: string) {
  if (id === intoId) throw new ProductError("invalid_request", "Choose a different destination tag");
  return db.transaction(async (tx) => {
    // Deterministic row-lock order prevents opposite merges deadlocking.
    const all = await tx.select().from(tags).where(and(eq(tags.tenantId, tenantId), sql`${tags.id} in (${id}, ${intoId})`)).orderBy(tags.id).for("update");
    if (all.length !== 2) throw new ProductError("not_found", "Tag not found", 404);
    await tx.insert(noteTags).select(tx.select({ tenantId: noteTags.tenantId, noteId: noteTags.noteId, tagId: sql<string>`${intoId}`.as("tag_id") })
      .from(noteTags).where(and(eq(noteTags.tenantId, tenantId), eq(noteTags.tagId, id)))).onConflictDoNothing();
    await tx.delete(tags).where(and(eq(tags.tenantId, tenantId), eq(tags.id, id)));
    return { ok: true };
  });
}
