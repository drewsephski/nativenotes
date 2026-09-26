import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { db } from "../src/db/client.js";
import { notes } from "../src/db/schema.js";
import { NoteVersionConflictError } from "../src/domain/errors.js";
import { noteRepository } from "../src/repositories/note-repository.js";
import { updateNoteForTenant } from "../src/services/note-service.js";

const tenantA = "org-test-a";
const tenantB = "org-test-b";
const noteIds = [
  "note-test-a",
  "note-test-b",
  "note-occ-a",
  "note-cross-tenant",
] as const;

describe("database tenant isolation", () => {
  beforeAll(async () => {
    await db.delete(notes).where(inArray(notes.id, [...noteIds]));
    await db.insert(notes).values([
      { id: "note-test-a", tenantId: tenantA, title: "A", body: "A" },
      { id: "note-test-b", tenantId: tenantB, title: "B", body: "B" },
    ]);
  });

  afterAll(async () => {
    await db.delete(notes).where(inArray(notes.id, [...noteIds]));
  });

  it("returns only the requested tenant's notes", async () => {
    await expect(noteRepository.listByTenant(tenantA)).resolves.toEqual([
      expect.objectContaining({
        id: "note-test-a",
        tenantId: tenantA,
        version: 1,
      }),
    ]);
    await expect(noteRepository.listByTenant(tenantB)).resolves.toEqual([
      expect.objectContaining({
        id: "note-test-b",
        tenantId: tenantB,
        version: 1,
      }),
    ]);
  });

  it("defaults new notes to version 1", async () => {
    const created = await noteRepository.create({
      id: "note-occ-a",
      tenantId: tenantA,
      title: "OCC start",
      body: "v1 body",
    });
    expect(created.version).toBe(1);
  });
});

describe("atomic optimistic concurrency", () => {
  beforeAll(async () => {
    await db.delete(notes).where(eq(notes.id, "note-occ-a"));
    await db.insert(notes).values({
      id: "note-occ-a",
      tenantId: tenantA,
      title: "Start",
      body: "original",
      version: 1,
    });
  });

  afterAll(async () => {
    await db.delete(notes).where(inArray(notes.id, [...noteIds]));
  });

  it("Client A wins with expectedVersion 1; Client B conflicts; stored content equals A", async () => {
    const clientA = await updateNoteForTenant({
      tenantId: tenantA,
      noteId: "note-occ-a",
      expectedVersion: 1,
      title: "From A",
      body: "A body",
    });

    expect(clientA.version).toBe(2);
    expect(clientA.title).toBe("From A");
    expect(clientA.body).toBe("A body");

    await expect(
      updateNoteForTenant({
        tenantId: tenantA,
        noteId: "note-occ-a",
        expectedVersion: 1,
        title: "From B",
        body: "B body",
      }),
    ).rejects.toBeInstanceOf(NoteVersionConflictError);

    const stored = await noteRepository.findByTenantAndId(
      tenantA,
      "note-occ-a",
    );
    expect(stored).toMatchObject({
      title: "From A",
      body: "A body",
      version: 2,
    });
  });

  it("tenant A cannot update tenant B note (not found, not conflict)", async () => {
    await db.delete(notes).where(eq(notes.id, "note-cross-tenant"));
    await db.insert(notes).values({
      id: "note-cross-tenant",
      tenantId: tenantB,
      title: "B only",
      body: "secret",
      version: 1,
    });

    await expect(
      updateNoteForTenant({
        tenantId: tenantA,
        noteId: "note-cross-tenant",
        expectedVersion: 1,
        title: "Hijacked",
        body: "leaked",
      }),
    ).rejects.toMatchObject({ name: "NoteNotFoundError" });

    const stillB = await noteRepository.findByTenantAndId(
      tenantB,
      "note-cross-tenant",
    );
    expect(stillB).toMatchObject({
      title: "B only",
      body: "secret",
      version: 1,
    });
  });
});
