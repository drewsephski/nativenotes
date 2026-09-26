import { randomUUID } from "node:crypto";

import type { Note } from "../db/schema.js";
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

export type CreateNoteForTenantInput = {
  tenantId: string;
  title: string;
  body: string;
};

function mapNote(note: Note): NoteListItem {
  return {
    id: note.id,
    title: note.title,
    body: note.body,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

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
    notes: notes.map(mapNote),
  };
}

export async function listNotes(
  authContext: AuthContext,
  repository: NoteRepository = noteRepository,
): Promise<NoteListResult> {
  return listNotesForTenant(authContext.tenantId, repository);
}

/**
 * Transport-independent note creation. Tenant must come from verified session
 * / auth context — never from client-supplied tenant IDs.
 */
export async function createNoteForTenant(
  input: CreateNoteForTenantInput,
  repository: NoteRepository = noteRepository,
): Promise<NoteListItem> {
  const note = await repository.create({
    id: randomUUID(),
    tenantId: input.tenantId,
    title: input.title,
    body: input.body,
  });
  return mapNote(note);
}
