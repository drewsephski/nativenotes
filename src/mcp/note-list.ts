import { registerProductTools } from "./product-tools.js";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/server";

import type { AuthContext } from "../domain/auth-context.js";
import type { NoteRepository } from "../repositories/note-repository.js";
import { listNotes as listNotesFromService } from "../services/note-service.js";
import { noteFilter } from "../domain/product-inputs.js";
import { queryNoteMetadata } from "../repositories/knowledge-repository.js";

const noteOutput = z.object({
  id: z.string(),
  title: z.string(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Re-export shared service entry for MCP + unit tests. */
export async function listNotes(
  authContext: AuthContext,
  repository?: NoteRepository,
) {
  return listNotesFromService(authContext, repository);
}

export function createMcpServer(authContext: AuthContext): McpServer {
  const server = new McpServer({ name: "nativenotes", version: "0.1.0" });

  server.registerTool(
    "note.list",
    {
      title: "List notes",
      description:
        "Read-only. List note metadata without bodies for the workspace bound to this OAuth token. Use note.get for content. Defaults to active notes, with limit/offset pagination and nextOffset. Tenant authority never comes from tool input.",
      inputSchema: noteFilter,
      outputSchema: z.object({
        notes: z.array(noteOutput),
        hasMore: z.boolean(),
        nextOffset: z.number().nullable(),
      }),
    },
    async (input) => {
      const output = await queryNoteMetadata(
        authContext.tenantId,
        noteFilter.parse(input),
      );

      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    },
  );

  registerProductTools(server, authContext);
  return server;
}
