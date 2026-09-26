import { productCommands, ProductError, type ProductCommand } from "../domain/product-inputs.js";
import { createNoteForTenant, updateNoteForTenant } from "./note-service.js";
import { saveFolder } from "../repositories/folder-repository.js";
import { saveTag, assignTag, deleteTag, mergeTag } from "../repositories/tag-repository.js";
import { getNote, restoreRevision, setInstructions, setNoteMetadata } from "../repositories/knowledge-repository.js";

/** Explicit commands only. The caller supplies verified tenant/user authority. */
export async function executeProductCommand(tenantId: string, userId: string, command: ProductCommand, raw: unknown) {
  switch (command) {
    case "note.create": {
      const input = productCommands[command].parse(raw);
      const note = await createNoteForTenant({ ...input, tenantId, authorUserId: userId });
      return getNote(tenantId, note.id);
    }
    case "note.update": {
      const { id, ...input } = productCommands[command].parse(raw);
      await updateNoteForTenant({ ...input, noteId: id, tenantId, authorUserId: userId });
      return getNote(tenantId, id);
    }
    case "note.favorite": {
      const { id, favorited } = productCommands[command].parse(raw);
      return setNoteMetadata(tenantId, id, { favorited });
    }
    case "note.move": {
      const { id, folderId } = productCommands[command].parse(raw);
      return setNoteMetadata(tenantId, id, { folderId });
    }
    case "note.freshness": {
      const { id, freshness } = productCommands[command].parse(raw);
      return setNoteMetadata(tenantId, id, { freshness, verifiedAt: null });
    }
    case "note.confirm": {
      const { id } = productCommands[command].parse(raw);
      return setNoteMetadata(tenantId, id, { freshness: "current", verifiedAt: new Date() });
    }
    case "note.archive": {
      const { id } = productCommands[command].parse(raw);
      return setNoteMetadata(tenantId, id, { archivedAt: new Date() });
    }
    case "note.trash": {
      const { id } = productCommands[command].parse(raw);
      return setNoteMetadata(tenantId, id, { trashedAt: new Date(), purgeAfter: new Date(Date.now() + 30 * 86400_000) });
    }
    case "note.restore": {
      const { id, from } = productCommands[command].parse(raw);
      return setNoteMetadata(tenantId, id, from === "trash" ? { trashedAt: null, purgeAfter: null } : { archivedAt: null });
    }
    case "note.restoreRevision": {
      const { id, revisionId, expectedVersion } = productCommands[command].parse(raw);
      return restoreRevision(tenantId, id, revisionId, expectedVersion, userId);
    }
    case "folder.create": return saveFolder(tenantId, productCommands[command].parse(raw));
    case "folder.update": return saveFolder(tenantId, productCommands[command].parse(raw));
    case "tag.create": { const { name } = productCommands[command].parse(raw); return saveTag(tenantId, name); }
    case "tag.rename": { const { id, name } = productCommands[command].parse(raw); return saveTag(tenantId, name, id); }
    case "tag.merge": { const { id, intoId } = productCommands[command].parse(raw); return mergeTag(tenantId, id, intoId); }
    case "tag.delete": { const { id } = productCommands[command].parse(raw); return deleteTag(tenantId, id); }
    case "tag.assign": { const { noteId, tagId } = productCommands[command].parse(raw); return assignTag(tenantId, noteId, tagId); }
    case "tag.remove": { const { noteId, tagId } = productCommands[command].parse(raw); return assignTag(tenantId, noteId, tagId, true); }
    case "instructions.set": { const { folderId, instructions } = productCommands[command].parse(raw); return setInstructions(tenantId, folderId, instructions); }
    default: throw new ProductError("invalid_request", "Unknown operation");
  }
}
