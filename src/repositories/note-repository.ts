import { and, asc, eq } from "drizzle-orm";

import { db } from "../db/client.js";
import { notes, type Note } from "../db/schema.js";

export interface NoteRepository {
  listByTenant(tenantId: string): Promise<Note[]>;
}

export const noteRepository: NoteRepository = {
  async listByTenant(tenantId) {
    return db
      .select()
      .from(notes)
      .where(and(eq(notes.tenantId, tenantId)))
      .orderBy(asc(notes.createdAt));
  },
};
