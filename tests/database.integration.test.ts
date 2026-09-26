import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";

import { db } from "../src/db/client.js";
import { notes } from "../src/db/schema.js";
import { noteRepository } from "../src/repositories/note-repository.js";

const tenantA = "org-test-a";
const tenantB = "org-test-b";

describe("database tenant isolation", () => {
  beforeAll(async () => {
    await db.insert(notes).values([
      { id: "note-test-a", tenantId: tenantA, title: "A", body: "A" },
      { id: "note-test-b", tenantId: tenantB, title: "B", body: "B" },
    ]);
  });

  afterAll(async () => {
    await db.delete(notes).where(inArray(notes.tenantId, [tenantA, tenantB]));
  });

  it("returns only the requested tenant's notes", async () => {
    await expect(noteRepository.listByTenant(tenantA)).resolves.toEqual([
      expect.objectContaining({ id: "note-test-a", tenantId: tenantA }),
    ]);
    await expect(noteRepository.listByTenant(tenantB)).resolves.toEqual([
      expect.objectContaining({ id: "note-test-b", tenantId: tenantB }),
    ]);
  });
});
