import { z } from "zod";
const date = z.string().datetime();
const id = z.string();
export const noteMetadata = z.object({
  id,
  title: z.string(),
  summary: z.string().nullable(),
  folderId: id.nullable(),
  favorited: z.boolean(),
  freshness: z.enum(["current", "needs_review", "superseded"]),
  version: z.number().int().positive(),
  createdAt: date,
  updatedAt: date,
  createdByUserId: id.nullable(),
  verifiedAt: date.nullable(),
  archivedAt: date.nullable(),
  trashedAt: date.nullable(),
  purgeAfter: date.nullable(),
});
export const noteOutput = noteMetadata.extend({
  body: z.string(),
  tags: z.array(z.object({ id, name: z.string() })).optional(),
});
export const discoveryOutput = z.object({
  notes: z.array(noteMetadata),
  hasMore: z.boolean(),
  nextOffset: z.number().nullable(),
});
const folder = z.object({
  id,
  name: z.string(),
  parentId: id.nullable(),
  position: z.number().int(),
  archivedAt: date.nullable(),
  createdAt: date,
  updatedAt: date,
});
const tag = z.object({ id, name: z.string(), normalizedName: z.string() });
const proposalMetadata = z.object({
  id,
  noteId: id,
  expectedVersion: z.number().int(),
  title: z.string(),
  reason: z.string(),
  source: z.string(),
  proposedByUserId: id,
  oauthClientId: id.nullable(),
  status: z.enum(["pending", "accepted", "rejected"]),
  createdAt: date,
  reviewedByUserId: id.nullable(),
  reviewedAt: date.nullable(),
  appliedVersion: z.number().nullable(),
});
const proposal = proposalMetadata.extend({
  body: z.string(),
  summary: z.string().nullable(),
});
const ok = z.object({ ok: z.literal(true) });
const instructions = z.object({
  chain: z.array(
    z.object({
      folderId: id.nullable(),
      scopeType: z.enum(["workspace", "folder"]),
      name: z.string(),
      instructions: z.string(),
    }),
  ),
});
export const outputSchemas = {
  "note.get": noteOutput,
  "note.search": discoveryOutput,
  "folder.list": z.object({ folders: z.array(folder) }),
  "tag.list": z.object({
    tags: z.array(tag.extend({ noteCount: z.number().int() })),
  }),
  "instructions.get": instructions,
  "proposal.get": proposal.extend({
    base: z.object({
      title: z.string(),
      body: z.string(),
      summary: z.string().nullable(),
    }),
    expiresAt: date,
    expired: z.boolean(),
  }),
  "proposal.list": z.object({
    proposals: z.array(proposalMetadata),
    hasMore: z.boolean(),
  }),
  "note.history": z.object({
    hasMore: z.boolean(),
    nextOffset: z.number().nullable(),
    revisions: z.array(
      z.object({
        id,
        version: z.number().int(),
        title: z.string(),
        body: z.string(),
        summary: z.string().nullable(),
        authorUserId: id.nullable(),
        createdAt: date,
        proposal: z
          .object({
            id: id.nullable(),
            proposedByUserId: id.nullable(),
            oauthClientId: id.nullable(),
            source: z.string().nullable(),
            reviewedByUserId: id.nullable(),
          })
          .nullable(),
      }),
    ),
  }),
  "note.proposeUpdate": proposal,
  "note.create": noteOutput,
  "note.update": noteOutput,
  "note.favorite": noteOutput,
  "note.archive": noteOutput,
  "note.trash": noteOutput,
  "note.restore": noteOutput,
  "note.move": noteOutput,
  "note.freshness": noteOutput,
  "note.confirm": noteOutput,
  "note.restoreRevision": noteOutput,
  "folder.create": folder,
  "folder.update": folder,
  "tag.create": tag,
  "tag.rename": tag,
  "tag.assign": ok,
  "tag.remove": ok,
  "tag.merge": ok,
  "tag.delete": ok,
  "instructions.set": ok,
};

/** Normalize Dates, validate and strip internal authority / retry bookkeeping. */
export function toolResult(schema: z.ZodObject, value: unknown) {
  const parsed = schema.safeParse(JSON.parse(JSON.stringify(value)));
  if (!parsed.success) {
    console.error("MCP tool returned an invalid output shape");
    throw new Error("MCP output did not match its declared schema");
  }
  const output = parsed.data;
  return {
    content: [{ type: "text" as const, text: JSON.stringify(output) }],
    structuredContent: output,
  };
}
