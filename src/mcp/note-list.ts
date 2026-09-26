import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/server";

import type { AuthContext } from "../domain/auth-context.js";
import {
  noteRepository,
  type NoteRepository,
} from "../repositories/note-repository.js";

const noteOutput = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export async function listNotes(
  authContext: AuthContext,
  repository: NoteRepository = noteRepository,
) {
  const notes = await repository.listByTenant(authContext.tenantId);
  return {
    notes: notes.map((note) => ({
      id: note.id,
      title: note.title,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    })),
  };
}

export function createMcpServer(authContext: AuthContext): McpServer {
  const server = new McpServer({ name: "hjarni", version: "0.1.0" });

  server.registerTool(
    "note.list",
    {
      title: "List notes",
      description: "List notes belonging to the authenticated organization.",
      inputSchema: z.object({}),
      outputSchema: z.object({ notes: z.array(noteOutput) }),
    },
    async () => {
      const output = await listNotes(authContext);

      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    },
  );

  return server;
}
