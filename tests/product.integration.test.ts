import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { folders, instructions, notes, noteRevisions, tags } from "../src/db/schema.js";
import { noteRepository } from "../src/repositories/note-repository.js";
import { saveFolder } from "../src/repositories/folder-repository.js";
import { assignTag, listTags, mergeTag, saveTag, deleteTag } from "../src/repositories/tag-repository.js";
import { getNote, history, instructionChain, navigation, queryNotes, restoreRevision, setInstructions, setNoteMetadata } from "../src/repositories/knowledge-repository.js";
import { updateNoteForTenant } from "../src/services/note-service.js";
import { executeProductCommand } from "../src/services/product-service.js";
import { wikiGraph, wikiTitles } from "../src/services/wiki-service.js";
import { noteFilter } from "../src/domain/product-inputs.js";

const tenant = `product-${randomUUID()}`;
const other = `product-${randomUUID()}`;
const noteId = randomUUID();
const author = randomUUID();
const query = (input = {}) => queryNotes(tenant, noteFilter.parse(input));
afterAll(async () => {
  for (const table of [notes, instructions, tags]) await db.delete(table).where(inArray(table.tenantId, [tenant, other]));
  await db.update(folders).set({ parentId: null }).where(inArray(folders.tenantId, [tenant, other]));
  await db.delete(folders).where(inArray(folders.tenantId, [tenant, other]));
});
describe("knowledge product", { timeout: 30_000 }, () => {
  it("creates immutable initial snapshots and preserves author provenance", async () => {
    await noteRepository.create({ id: noteId, tenantId: tenant, title: "Knowledge", body: "original", summary: "A summary", authorUserId: author });
    expect(await getNote(tenant, noteId)).toMatchObject({ createdByUserId: author, version: 1 });
    expect(await history(tenant, noteId)).toMatchObject([{ version: 1, body: "original", authorUserId: author }]);
  });
  it("isolates every note read, metadata mutation and history operation", async () => {
    await expect(getNote(other, noteId)).rejects.toThrow();
    await expect(setNoteMetadata(other, noteId, { favorited: true })).rejects.toThrow();
    await expect(history(other, noteId)).rejects.toThrow();
    expect((await queryNotes(other, noteFilter.parse({ query: "Knowledge" }))).notes).toEqual([]);
  });
  it("atomically revises content and rolls back the note if its snapshot fails", async () => {
    await updateNoteForTenant({ tenantId: tenant, noteId, title: "Knowledge", body: "v2", expectedVersion: 1, authorUserId: author });
    await expect(updateNoteForTenant({ tenantId: tenant, noteId, title: "Lost update", body: "bad", expectedVersion: 1 })).rejects.toMatchObject({ currentVersion: 2 });
    const blocking = randomUUID();
    await db.insert(noteRevisions).values({ id: blocking, tenantId: tenant, noteId, version: 3, title: "Test collision", body: "" });
    await expect(updateNoteForTenant({ tenantId: tenant, noteId, title: "Must roll back", body: "bad", expectedVersion: 2 })).rejects.toThrow();
    expect(await getNote(tenant, noteId)).toMatchObject({ title: "Knowledge", body: "v2", version: 2, freshness: "needs_review" });
    await db.delete(noteRevisions).where(and(eq(noteRevisions.tenantId, tenant), eq(noteRevisions.id, blocking)));
    const revisions = await history(tenant, noteId);
    const original = revisions.find(r => r.version === 1)!;
    await expect(restoreRevision(other, noteId, original.id, 2, author)).rejects.toThrow();
    const restored = await restoreRevision(tenant, noteId, original.id, 2, author);
    expect(restored).toMatchObject({ body: "original", version: 3 });
    expect((await history(tenant, noteId)).map(r => r.version)).toEqual([3, 2, 1]);
  });
  it("supports nested folders, blocks cycles including concurrent opposite moves, and isolates parents", async () => {
    const a = await saveFolder(tenant, { name: "Root", parentId: null, position: 0 });
    const b = await saveFolder(tenant, { name: "Child", parentId: a.id, position: 1 });
    await expect(saveFolder(tenant, { id: a.id, parentId: b.id })).rejects.toMatchObject({ code: "folder_cycle" });
    await expect(saveFolder(other, { name: "Intruder", parentId: a.id, position: 0 })).rejects.toThrow();
    await expect(saveFolder(other, { id: a.id, name: "Bad" })).rejects.toThrow();
    const c = await saveFolder(tenant, { name: "Root two", parentId: null, position: 2 });
    const results = await Promise.allSettled([saveFolder(tenant, { id: a.id, parentId: c.id }), saveFolder(tenant, { id: c.id, parentId: a.id })]);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    await setNoteMetadata(tenant, noteId, { folderId: b.id });
    await saveFolder(tenant, { id: b.id, archived: true });
    expect((await query()).notes).toHaveLength(1); // folder archive never hides/deletes notes
    expect((await navigation(tenant)).folderCounts[b.id]).toBe(1);
    await saveFolder(tenant, { id: b.id, archived: false, name: "Renamed" });
    await setInstructions(tenant, null, "Workspace rules");
    await setInstructions(tenant, a.id, "Parent rules");
    await setInstructions(tenant, b.id, "Child rules");
    const chain = await instructionChain(tenant, b.id);
    expect(chain.chain.filter(c => c.instructions).map(c => c.instructions)).toEqual(["Workspace rules", "Parent rules", "Child rules"]);
    await expect(instructionChain(other, b.id)).rejects.toThrow();
    await expect(setInstructions(other, b.id, "Bad")).rejects.toThrow();
    await expect(setNoteMetadata(other, noteId, { folderId: b.id })).rejects.toThrow();
  });
  it("normalizes tags, merges assignments without duplicates, and safely deletes tags", async () => {
    const a = await saveTag(tenant, "Research");
    const b = await saveTag(tenant, "Planning");
    const foreign = await saveTag(other, "Private");
    await expect(saveTag(tenant, "RESEARCH")).rejects.toThrow();
    await assignTag(tenant, noteId, a.id);
    await assignTag(tenant, noteId, b.id);
    await expect(assignTag(tenant, noteId, foreign.id)).rejects.toThrow();
    await expect(mergeTag(tenant, a.id, foreign.id)).rejects.toThrow();
    await mergeTag(tenant, a.id, b.id);
    expect((await getNote(tenant, noteId)).tags).toEqual([{ id: b.id, name: "Planning" }]);
    expect((await listTags(tenant))[0]?.noteCount).toBe(1);
    expect((await query({ query: "Planning" })).notes).toHaveLength(1);
    await saveTag(tenant, "Updated tag", b.id);
    await assignTag(tenant, noteId, b.id, true);
    expect((await getNote(tenant, noteId)).tags).toEqual([]);
    await assignTag(tenant, noteId, b.id);
    await deleteTag(tenant, b.id);
    expect((await getNote(tenant, noteId)).tags).toEqual([]);
    expect((await getNote(tenant, noteId)).body).toBe("original");
  });
  it("supports real favorites, archive, trash, restore, inbox, and confirmation without content version changes", async () => {
    await executeProductCommand(tenant, author, "note.favorite", { id: noteId, favorited: true });
    expect((await query({ view: "favorites" })).notes).toHaveLength(1);
    await executeProductCommand(tenant, author, "note.confirm", { id: noteId });
    expect(await getNote(tenant, noteId)).toMatchObject({ freshness: "current", verifiedAt: expect.any(String), version: 3 });
    await executeProductCommand(tenant, author, "note.archive", { id: noteId });
    expect((await query()).notes).toHaveLength(0);
    expect((await query({ view: "archive" })).notes).toHaveLength(1);
    await executeProductCommand(tenant, author, "note.trash", { id: noteId });
    expect((await query({ view: "archive" })).notes).toHaveLength(0);
    expect((await query({ view: "trash" })).notes[0]?.purgeAfter).toBeTruthy();
    await executeProductCommand(tenant, author, "note.restore", { id: noteId, from: "trash" });
    expect((await query({ view: "archive" })).notes).toHaveLength(1);
    await executeProductCommand(tenant, author, "note.restore", { id: noteId, from: "archive" });
    await executeProductCommand(tenant, author, "note.move", { id: noteId, folderId: null });
    expect((await query({ view: "inbox" })).notes).toHaveLength(1);
    expect((await navigation(tenant)).counts).toEqual({ all: 1, inbox: 1, favorites: 1, archive: 0, trash: 0 });
  });
  it("searches body and summary safely, and resolves links only inside the same workspace", async () => {
    expect((await query({ query: "original" })).notes).toHaveLength(1);
    expect((await query({ query: "summary" })).notes).toHaveLength(1);
    expect((await query({ query: "%" })).notes).toHaveLength(0);
    const source = await noteRepository.create({ id: randomUUID(), tenantId: tenant, title: "Source", body: "[[Knowledge]] [[Private]]" });
    await noteRepository.create({ id: randomUUID(), tenantId: other, title: "Private", body: "[[Knowledge]]" });
    expect((await wikiGraph(tenant)).edges).toEqual([{ source: source.id, target: noteId, title: "Knowledge" }]);
    expect((await wikiGraph(other)).edges).toEqual([]);
    expect(wikiTitles("[[A]] `[[code]]` ```\n[[fenced]]\n``` [[A]]")).toEqual(["A"]);
    await noteRepository.create({ id: randomUUID(), tenantId: tenant, title: "Knowledge", body: "" });
    expect((await wikiGraph(tenant)).edges).toEqual([]); // ambiguous title is not guessed
  });
});
