import { randomUUID } from "node:crypto";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../db/client.js";
import { folders, instructions, notes, noteTags, noteRevisions, tags, type Note } from "../db/schema.js";
import { ProductError, type noteFilter } from "../domain/product-inputs.js";
import { NoteNotFoundError } from "../domain/errors.js";
import { noteRepository } from "./note-repository.js";
import { updateNoteForTenant } from "../services/note-service.js";

export function publicNote(note: Note) {
  return { id: note.id, title: note.title, body: note.body, summary: note.summary,
    folderId: note.folderId, favorited: note.favorited, freshness: note.freshness,
    version: note.version, createdByUserId: note.createdByUserId,
    createdAt: note.createdAt.toISOString(), updatedAt: note.updatedAt.toISOString(),
    verifiedAt: note.verifiedAt?.toISOString() ?? null, archivedAt: note.archivedAt?.toISOString() ?? null,
    trashedAt: note.trashedAt?.toISOString() ?? null, purgeAfter: note.purgeAfter?.toISOString() ?? null };
}
export async function getNote(tenantId: string, id: string) {
  const note = await noteRepository.findByTenantAndId(tenantId, id);
  if (!note) throw new NoteNotFoundError();
  const assigned = await db.select({ id: tags.id, name: tags.name }).from(noteTags)
    .innerJoin(tags, and(eq(tags.tenantId, tenantId), eq(tags.id, noteTags.tagId)))
    .where(and(eq(noteTags.tenantId, tenantId), eq(noteTags.noteId, id))).orderBy(tags.normalizedName);
  return { ...publicNote(note), tags: assigned };
}
export async function queryNotes(tenantId: string, input: z.infer<typeof noteFilter>) {
  const conditions = [eq(notes.tenantId, tenantId)];
  if (input.view === "trash") conditions.push(isNotNull(notes.trashedAt));
  else {
    conditions.push(isNull(notes.trashedAt));
    conditions.push(input.view === "archive" ? isNotNull(notes.archivedAt) : isNull(notes.archivedAt));
  }
  if (input.view === "inbox") conditions.push(isNull(notes.folderId));
  if (input.view === "favorites") conditions.push(eq(notes.favorited, true));
  if (input.folderId) conditions.push(eq(notes.folderId, input.folderId));
  if (input.tagId) conditions.push(sql`exists (select 1 from ${noteTags} where ${noteTags.tenantId} = ${tenantId} and ${noteTags.noteId} = ${notes.id} and ${noteTags.tagId} = ${input.tagId})`);
  if (input.query) {
    const pattern = `%${input.query.replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(sql`(${notes.title} ilike ${pattern} or ${notes.body} ilike ${pattern} or ${notes.summary} ilike ${pattern}
      or exists (select 1 from ${folders} where ${folders.tenantId} = ${tenantId} and ${folders.id} = ${notes.folderId} and ${folders.name} ilike ${pattern})
      or exists (select 1 from ${noteTags} join ${tags} on ${tags.tenantId} = ${noteTags.tenantId} and ${tags.id} = ${noteTags.tagId}
        where ${noteTags.tenantId} = ${tenantId} and ${noteTags.noteId} = ${notes.id} and ${tags.name} ilike ${pattern}))`);
  }
  const rows = await db.select().from(notes).where(and(...conditions)).orderBy(desc(notes.updatedAt), notes.id).limit(input.limit + 1).offset(input.offset);
  return { notes: rows.slice(0, input.limit).map(publicNote), hasMore: rows.length > input.limit };
}
export async function navigation(tenantId: string) {
  const rows = await db.select({
    folderId: notes.folderId,
    all: sql<number>`count(*) filter (where archived_at is null and trashed_at is null)`.mapWith(Number),
    favorites: sql<number>`count(*) filter (where favorited and archived_at is null and trashed_at is null)`.mapWith(Number),
    archive: sql<number>`count(*) filter (where archived_at is not null and trashed_at is null)`.mapWith(Number),
    trash: sql<number>`count(*) filter (where trashed_at is not null)`.mapWith(Number),
  }).from(notes).where(eq(notes.tenantId, tenantId)).groupBy(notes.folderId);
  return { counts: rows.reduce((a, r) => ({ all: a.all + r.all, inbox: a.inbox + (r.folderId === null ? r.all : 0), favorites: a.favorites + r.favorites, archive: a.archive + r.archive, trash: a.trash + r.trash }), { all: 0, inbox: 0, favorites: 0, archive: 0, trash: 0 }),
    folderCounts: Object.fromEntries(rows.filter(r => r.folderId).map(r => [r.folderId, r.all])) };
}
export async function setNoteMetadata(tenantId: string, id: string, patch: Partial<Pick<Note, "folderId" | "favorited" | "freshness" | "verifiedAt" | "archivedAt" | "trashedAt" | "purgeAfter">>) {
  if (patch.folderId) {
    const [folder] = await db.select({ id: folders.id }).from(folders).where(and(eq(folders.tenantId, tenantId), eq(folders.id, patch.folderId)));
    if (!folder) throw new ProductError("not_found", "Folder not found", 404);
  }
  const updated = await db.update(notes).set(patch).where(and(eq(notes.tenantId, tenantId), eq(notes.id, id))).returning();
  if (!updated.length) throw new NoteNotFoundError();
  // Metadata never increments the content version or invalidates a content draft.
  return getNote(tenantId, id);
}
export async function history(tenantId: string, noteId: string) {
  if (!await noteRepository.findByTenantAndId(tenantId, noteId)) throw new NoteNotFoundError();
  return db.select({ id: noteRevisions.id, version: noteRevisions.version, title: noteRevisions.title,
    body: noteRevisions.body, summary: noteRevisions.summary, authorUserId: noteRevisions.authorUserId, createdAt: noteRevisions.createdAt,
  }).from(noteRevisions).where(and(eq(noteRevisions.tenantId, tenantId), eq(noteRevisions.noteId, noteId))).orderBy(desc(noteRevisions.version));
}
export async function restoreRevision(tenantId: string, noteId: string, revisionId: string, expectedVersion: number, authorUserId: string) {
  const [revision] = await db.select().from(noteRevisions).where(and(eq(noteRevisions.tenantId, tenantId), eq(noteRevisions.noteId, noteId), eq(noteRevisions.id, revisionId)));
  if (!revision) throw new ProductError("not_found", "Revision not found", 404);
  await updateNoteForTenant({ tenantId, noteId, expectedVersion, title: revision.title, body: revision.body, summary: revision.summary, authorUserId });
  return getNote(tenantId, noteId);
}
export async function instructionChain(tenantId: string, folderId: string | null) {
  return db.transaction(async (tx) => {
    const allFolders = await tx.select().from(folders).where(eq(folders.tenantId, tenantId));
    const all = await tx.select().from(instructions).where(eq(instructions.tenantId, tenantId));
    const path: typeof allFolders = [];
    const seen = new Set<string>();
    let next = folderId;
    while (next) {
      const folder = allFolders.find(f => f.id === next);
      if (!folder) throw new ProductError("not_found", "Folder not found", 404);
      if (seen.has(next)) throw new ProductError("folder_cycle", "Invalid folder hierarchy", 409);
      seen.add(next); path.unshift(folder); next = folder.parentId;
    }
    const chain = [{ folderId: null as string | null, scopeType: "workspace", name: "Workspace" }, ...path.map(f => ({ folderId: f.id, scopeType: "folder", name: f.name }))]
      .map(scope => ({ ...scope, instructions: all.find(i => i.folderId === scope.folderId)?.instructions ?? "" }));
    return { chain };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
export async function setInstructions(tenantId: string, folderId: string | null, text: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`instructions:${tenantId}`}, 0))`);
    if (folderId) {
      const [folder] = await tx.select({ id: folders.id }).from(folders).where(and(eq(folders.tenantId, tenantId), eq(folders.id, folderId)));
      if (!folder) throw new ProductError("not_found", "Folder not found", 404);
    }
    const condition = and(eq(instructions.tenantId, tenantId), folderId ? eq(instructions.folderId, folderId) : isNull(instructions.folderId));
    const [current] = await tx.select().from(instructions).where(condition);
    if (current) await tx.update(instructions).set({ instructions: text, updatedAt: new Date() }).where(condition);
    else await tx.insert(instructions).values({ id: randomUUID(), tenantId, folderId, scopeType: folderId ? "folder" : "workspace", instructions: text });
    return { ok: true };
  });
}
