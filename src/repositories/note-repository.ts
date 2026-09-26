import { and, asc, eq } from "drizzle-orm";

import { db } from "../db/client.js";
import { notes, type Note } from "../db/schema.js";

export type CreateNoteInput = {
  id: string;
  tenantId: string;
  title: string;
  body: string;
};

export interface NoteRepository {
  listByTenant(tenantId: string): Promise<Note[]>;
  create(input: CreateNoteInput): Promise<Note>;
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
};
