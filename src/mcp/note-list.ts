import { discoveryOutput, toolResult } from "./output-schemas.js";
import { productError } from "../domain/product-errors.js";
import { ForbiddenError } from "../domain/errors.js";
import { registerProductTools } from "./product-tools.js";
import { McpServer } from "@modelcontextprotocol/server";

import type { AuthContext } from "../domain/auth-context.js";
import type { NoteRepository } from "../repositories/note-repository.js";
import { listNotes as listNotesFromService } from "../services/note-service.js";
import { noteFilter } from "../domain/product-inputs.js";
import { queryNoteMetadata } from "../repositories/knowledge-repository.js";

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
      outputSchema: discoveryOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        if (!authContext.scopes.includes("mcp:read"))
          throw new ForbiddenError("Requires mcp:read");
        const output = await queryNoteMetadata(
          authContext.tenantId,
          noteFilter.parse(input),
        );

        return toolResult(discoveryOutput, output);
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(productError(error)),
            },
          ],
        };
      }
    },
  );

  registerProductTools(server, authContext);
  return server;
}
