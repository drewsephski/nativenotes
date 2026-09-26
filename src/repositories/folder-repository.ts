import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../db/client.js";
import { folders } from "../db/schema.js";
import { ProductError, type folderCreate, type folderUpdate } from "../domain/product-inputs.js";

export async function listFolders(tenantId: string) {
  return db.select().from(folders).where(eq(folders.tenantId, tenantId)).orderBy(asc(folders.position), asc(folders.name), asc(folders.id));
}

/** Serialize hierarchy changes BEFORE reading ancestors (READ COMMITTED).
 * All create/move/archive operations share this tenant-specific lock.
 */
export async function saveFolder(tenantId: string, input: z.infer<typeof folderCreate> | z.infer<typeof folderUpdate>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`folders:${tenantId}`}, 0))`);
    const all = await tx.select().from(folders).where(eq(folders.tenantId, tenantId));
    const existing = "id" in input ? all.find((f) => f.id === input.id) : undefined;
    if ("id" in input && !existing) throw new ProductError("not_found", "Folder not found", 404);
    const parentId = input.parentId === undefined ? existing?.parentId ?? null : input.parentId;
    const seen = new Set<string>();
    let parent = parentId;
    while (parent) {
      if (parent === existing?.id || seen.has(parent)) throw new ProductError("folder_cycle", "A folder cannot be moved into itself or a descendant");
      seen.add(parent);
      const ancestor = all.find((f) => f.id === parent);
      if (!ancestor) throw new ProductError("not_found", "Parent folder not found", 404);
      parent = ancestor.parentId;
    }
    if (existing && "id" in input) {
      const [updated] = await tx.update(folders).set({
        name: input.name ?? existing.name, parentId,
        position: input.position ?? existing.position, updatedAt: new Date(),
        ...(input.archived !== undefined ? { archivedAt: input.archived ? new Date() : null } : {}),
      }).where(and(eq(folders.tenantId, tenantId), eq(folders.id, existing.id))).returning();
      return updated!;
    }
    const [created] = await tx.insert(folders).values({ id: randomUUID(), tenantId, name: input.name!, parentId, position: input.position ?? 0 }).returning();
    return created!;
  });
}
