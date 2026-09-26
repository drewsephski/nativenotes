import { z } from "zod";

const id = z.string().min(1).max(200);
const name = z.string().trim().min(1).max(100);
export const noteContent = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().max(100_000),
  summary: z.string().max(4000).nullable().optional(),
});
export const noteFilter = z.object({
  view: z.enum(["all", "inbox", "favorites", "archive", "trash"]).default("all"),
  folderId: id.optional(), tagId: id.optional(),
  query: z.string().trim().max(200).optional(),
  limit: z.number().int().min(1).max(100).default(100),
  offset: z.number().int().min(0).max(100_000).default(0),
});
export const folderCreate = z.object({ name, parentId: id.nullable().default(null), position: z.number().int().min(0).default(0) });
export const folderUpdate = z.object({ id, name: name.optional(), parentId: id.nullable().optional(), position: z.number().int().min(0).optional(), archived: z.boolean().optional() });
export const instructionInput = z.object({ folderId: id.nullable().default(null), instructions: z.string().max(30_000) });
export const productCommands = {
  "note.create": noteContent,
  "note.update": noteContent.extend({ id, expectedVersion: z.number().int().positive() }),
  "note.favorite": z.object({ id, favorited: z.boolean() }),
  "note.archive": z.object({ id }),
  "note.trash": z.object({ id }),
  "note.restore": z.object({ id, from: z.enum(["archive", "trash"]) }),
  "note.move": z.object({ id, folderId: id.nullable() }),
  "note.freshness": z.object({ id, freshness: z.enum(["current", "needs_review", "superseded"]) }),
  "note.confirm": z.object({ id }),
  "note.restoreRevision": z.object({ id, revisionId: id, expectedVersion: z.number().int().positive() }),
  "folder.create": folderCreate,
  "folder.update": folderUpdate,
  "tag.create": z.object({ name }),
  "tag.rename": z.object({ id, name }),
  "tag.merge": z.object({ id, intoId: id }),
  "tag.delete": z.object({ id }),
  "tag.assign": z.object({ noteId: id, tagId: id }),
  "tag.remove": z.object({ noteId: id, tagId: id }),
  "instructions.set": instructionInput,
};
export type ProductCommand = keyof typeof productCommands;
export class ProductError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) { super(message); }
}
