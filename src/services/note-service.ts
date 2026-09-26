import { randomUUID } from "node:crypto";

import type { Note } from "../db/schema.js";
import type { AuthContext } from "../domain/auth-context.js";
import {
  NoteNotFoundError,
  NoteVersionConflictError,
} from "../domain/errors.js";
import {
  noteRepository,
  type NoteRepository,
} from "../repositories/note-repository.js";

export type NoteListItem = {
  id: string;
  title: string;
  body: string;
  version: number;
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

export type UpdateNoteForTenantInput = {
  tenantId: string;
  noteId: string;
  expectedVersion: number;
  title: string;
  body: string;
};

function mapNote(note: Note): NoteListItem {
  return {
    id: note.id,
    title: note.title,
    body: note.body,
    version: note.version,
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

/**
 * Transport-independent note update with atomic optimistic concurrency.
 * Tenant must come from verified session / auth context.
 */
export async function updateNoteForTenant(
  input: UpdateNoteForTenantInput,
  repository: NoteRepository = noteRepository,
): Promise<NoteListItem> {
  const updated = await repository.update({
    tenantId: input.tenantId,
    noteId: input.noteId,
    expectedVersion: input.expectedVersion,
    title: input.title,
    body: input.body,
  });

  if (updated) {
    return mapNote(updated);
  }

  // Distinguish not-found vs stale version without cross-tenant disclosure.
  const existing = await repository.findByTenantAndId(
    input.tenantId,
    input.noteId,
  );
  if (!existing) {
    throw new NoteNotFoundError();
  }
  throw new NoteVersionConflictError(existing.version);
}
