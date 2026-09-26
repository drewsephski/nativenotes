import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "../db/client.js";
import { notes, type Note } from "../db/schema.js";

export type CreateNoteInput = {
  id: string;
  tenantId: string;
  title: string;
  body: string;
};

export type UpdateNoteInput = {
  tenantId: string;
  noteId: string;
  expectedVersion: number;
  title: string;
  body: string;
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
      .where(and(eq(notes.tenantId, tenantId)))
      .orderBy(asc(notes.createdAt));
  },

  async create(input) {
    const inserted = await db
      .insert(notes)
      .values({
        id: input.id,
        tenantId: input.tenantId,
        title: input.title,
        body: input.body,
      })
      .returning();

    const note = inserted[0];
    if (!note) {
      throw new Error("Failed to create note");
    }
    return note;
  },

  async update(input) {
    const updated = await db
      .update(notes)
      .set({
        title: input.title,
        body: input.body,
        updatedAt: sql`now()`,
        version: sql`${notes.version} + 1`,
      })
      .where(
        and(
          eq(notes.tenantId, input.tenantId),
          eq(notes.id, input.noteId),
          eq(notes.version, input.expectedVersion),
        ),
      )
      .returning();

    return updated[0] ?? null;
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
