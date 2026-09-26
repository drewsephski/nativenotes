import type { AuthContext } from "../domain/auth-context.js";
import {
  noteRepository,
  type NoteRepository,
} from "../repositories/note-repository.js";

export type NoteListItem = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type NoteListResult = {
  notes: NoteListItem[];
};

/**
 * Transport-independent note listing. MCP and web HTTP share this path so
 * mapping, tenant filtering, and ordering stay in one place.
 */
export async function listNotesForTenant(
  tenantId: string,
  repository: NoteRepository = noteRepository,
): Promise<NoteListResult> {
  const notes = await repository.listByTenant(tenantId);
  return {
    notes: notes.map((note) => ({
      id: note.id,
      title: note.title,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    })),
  };
}

export async function listNotes(
  authContext: AuthContext,
  repository: NoteRepository = noteRepository,
): Promise<NoteListResult> {
  return listNotesForTenant(authContext.tenantId, repository);
}
