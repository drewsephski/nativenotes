import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { db } from "../db/client.js";
import { notes, noteRevisions, type Note } from "../db/schema.js";

export type CreateNoteInput = {
  id: string;
  tenantId: string;
  title: string;
  body: string;
  summary?: string | null;
  authorUserId?: string;
};

export type UpdateNoteInput = {
  tenantId: string;
  noteId: string;
  expectedVersion: number;
  title: string;
  body: string;
  summary?: string | null;
  authorUserId?: string;
};

export interface NoteRepository {
  listByTenant(tenantId: string): Promise<Note[]>;
  create(input: CreateNoteInput): Promise<Note>;
  /**
   * Atomic optimistic-concurrency update.
   * Matches tenant + id + expectedVersion in one UPDATE; increments version.
   * Returns the updated row, or null when no row matched.
   */
  update(input: UpdateNoteInput): Promise<Note | null>;
  findByTenantAndId(tenantId: string, noteId: string): Promise<Note | null>;
}

export const noteRepository: NoteRepository = {
  async listByTenant(tenantId) {
    return db
      .select()
      .from(notes)
      .where(
        and(
          eq(notes.tenantId, tenantId),
          isNull(notes.archivedAt),
          isNull(notes.trashedAt),
        ),
      )
      .orderBy(asc(notes.createdAt));
  },

  async create(input) {
    return db.transaction(async (tx) => {
      const [note] = await tx
        .insert(notes)
        .values({
          id: input.id,
          tenantId: input.tenantId,
          title: input.title,
          body: input.body,
          summary: input.summary,
          createdByUserId: input.authorUserId,
        })
        .returning();
      if (!note) throw new Error("Failed to create note");
      await tx.insert(noteRevisions).values(snapshot(note, input.authorUserId));
      return note;
    });
  },

  async update(input) {
    return db.transaction(async (tx) => {
      const [prior] = await tx
        .select()
        .from(notes)
        .where(
          and(eq(notes.tenantId, input.tenantId), eq(notes.id, input.noteId)),
        )
        .for("update");
      if (!prior || prior.version !== input.expectedVersion) return null;
      // Seed the baseline for notes that predate revision history.
      await tx
        .insert(noteRevisions)
        .values(snapshot(prior))
        .onConflictDoNothing();
      const [updated] = await tx
        .update(notes)
        .set({
          title: input.title,
          body: input.body,
          ...(input.summary !== undefined ? { summary: input.summary } : {}),
          updatedAt: sql`now()`,
          version: sql`${notes.version} + 1`,
          freshness: "needs_review",
          verifiedAt: null,
        })
        .where(
          and(
            eq(notes.tenantId, input.tenantId),
            eq(notes.id, input.noteId),
            eq(notes.version, input.expectedVersion),
          ),
        )
        .returning();
      if (!updated) throw new Error("Locked note update failed");
      await tx
        .insert(noteRevisions)
        .values(snapshot(updated, input.authorUserId));
      return updated;
    });
  },

  async findByTenantAndId(tenantId, noteId) {
    const rows = await db
      .select()
      .from(notes)
      .where(and(eq(notes.tenantId, tenantId), eq(notes.id, noteId)))
      .limit(1);
    return rows[0] ?? null;
  },
};

function snapshot(note: Note, authorUserId?: string) {
  return {
    id: randomUUID(),
    tenantId: note.tenantId,
    noteId: note.id,
    version: note.version,
    title: note.title,
    body: note.body,
    summary: note.summary,
    authorUserId: authorUserId ?? null,
    createdAt: note.updatedAt,
  };
}
