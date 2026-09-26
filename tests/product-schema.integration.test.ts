import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db/client.js";
import {
  folders,
  instructions,
  notes,
  noteTags,
  noteRevisions,
  tags,
} from "../src/db/schema.js";

const tenant = `schema-${randomUUID()}`;
const other = `schema-${randomUUID()}`;
const folder = randomUUID();
const note = randomUUID();
const tag = randomUUID();
afterAll(async () => {
  await db.delete(notes).where(inArray(notes.tenantId, [tenant, other]));
  await db.delete(instructions).where(eq(instructions.tenantId, tenant));
  await db.delete(tags).where(inArray(tags.tenantId, [tenant, other]));
  await db.delete(folders).where(inArray(folders.tenantId, [tenant, other]));
});
describe("product schema tenant constraints", () => {
  it("preserves content defaults and rejects cross-tenant relationships at the database", async () => {
    await db
      .insert(folders)
      .values({ id: folder, tenantId: tenant, name: "A" });
    await db
      .insert(notes)
      .values({
        id: note,
        tenantId: tenant,
        title: "A",
        body: "original",
        folderId: folder,
      });
    await db
      .insert(tags)
      .values({
        id: tag,
        tenantId: other,
        name: "Other",
        normalizedName: "other",
      });
    await expect(
      db
        .insert(folders)
        .values({
          id: randomUUID(),
          tenantId: other,
          name: "Bad",
          parentId: folder,
        }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(notes)
        .values({
          id: randomUUID(),
          tenantId: other,
          title: "Bad",
          body: "",
          folderId: folder,
        }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(noteTags)
        .values({ tenantId: tenant, noteId: note, tagId: tag }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(instructions)
        .values({
          id: randomUUID(),
          tenantId: other,
          scopeType: "folder",
          folderId: folder,
          instructions: "Bad",
        }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(noteRevisions)
        .values({
          id: randomUUID(),
          tenantId: other,
          noteId: note,
          version: 1,
          title: "Bad",
          body: "",
        }),
    ).rejects.toThrow();
    const [stored] = await db.select().from(notes).where(eq(notes.id, note));
    expect(stored).toMatchObject({
      body: "original",
      version: 1,
      favorited: false,
      freshness: "current",
      trashedAt: null,
    });
  });
  it("enforces case-insensitive tag uniqueness and instruction scope uniqueness", async () => {
    await db
      .insert(tags)
      .values({
        id: randomUUID(),
        tenantId: tenant,
        name: "Research",
        normalizedName: "research",
      });
    await expect(
      db
        .insert(tags)
        .values({
          id: randomUUID(),
          tenantId: tenant,
          name: "RESEARCH",
          normalizedName: "research",
        }),
    ).rejects.toThrow();
    await db
      .insert(instructions)
      .values({
        id: randomUUID(),
        tenantId: tenant,
        scopeType: "workspace",
        instructions: "First",
      });
    await expect(
      db
        .insert(instructions)
        .values({
          id: randomUUID(),
          tenantId: tenant,
          scopeType: "workspace",
          instructions: "Second",
        }),
    ).rejects.toThrow();
    await expect(
      db
        .update(folders)
        .set({ parentId: folder })
        .where(eq(folders.id, folder)),
    ).rejects.toThrow();
  });
});
