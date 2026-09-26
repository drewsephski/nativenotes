import type { IncomingMessage, ServerResponse } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { ZodError } from "zod";
import { auth } from "../auth/auth.js";
import { ForbiddenError, NoteNotFoundError, NoteVersionConflictError } from "../domain/errors.js";
import { noteFilter, productCommands, ProductError, type ProductCommand } from "../domain/product-inputs.js";
import { getCurrentMembership } from "../services/membership-service.js";
import { executeProductCommand } from "../services/product-service.js";
import { listFolders } from "../repositories/folder-repository.js";
import { listTags } from "../repositories/tag-repository.js";
import { getNote, history, instructionChain, navigation, queryNotes } from "../repositories/knowledge-repository.js";
import { wikiGraph } from "../services/wiki-service.js";
import { isTrustedMutationOrigin } from "./request-origin.js";

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}
export function productError(error: unknown) {
  if (error instanceof ForbiddenError) return { status: 403, error: "forbidden", message: error.message };
  if (error instanceof NoteNotFoundError) return { status: 404, error: "not_found", message: "Note not found" };
  if (error instanceof NoteVersionConflictError) return { status: 409, error: "version_conflict", message: "This note changed elsewhere. Your draft has been kept.", currentVersion: error.currentVersion };
  if (error instanceof ProductError) return { status: error.status, error: error.code, message: error.message };
  if (error instanceof ZodError || error instanceof SyntaxError) return { status: 400, error: "invalid_request", message: "Check the submitted fields" };
  const cause = error && typeof error === "object" && "cause" in error ? error.cause : error;
  if (cause && typeof cause === "object" && "code" in cause) {
    if (cause.code === "23505") return { status: 409, error: "duplicate", message: "That name already exists in this workspace" };
    if (cause.code === "23503") return { status: 404, error: "not_found", message: "Related item not found in this workspace" };
  }
  return { status: 500, error: "internal_server_error", message: "Could not complete the request" };
}
export async function handleProductRoute(request: IncomingMessage, response: ServerResponse) {
  try {
    if (request.method !== "GET" && request.method !== "POST") { json(response, 405, { error: "method_not_allowed" }); return; }
    if (request.method === "POST" && !isTrustedMutationOrigin(request)) throw new ForbiddenError();
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) { json(response, 401, { error: "unauthorized", message: "Sign in required" }); return; }
    const tenantId = session.session.activeOrganizationId;
    if (!tenantId) throw new ProductError("no_active_workspace", "Select a workspace", 409);
    const context = await auth.$context;
    await getCurrentMembership(context.adapter, session.user.id, tenantId);
    // A precondition only: never an authority source. Protects in-flight/tab switches.
    const expected = request.headers["x-workspace-id"];
    if (expected !== tenantId) throw new ProductError("workspace_changed", "Workspace changed. Reload and try again.", 409);
    const url = new URL(request.url!, "http://localhost");
    const resource = url.pathname.slice("/api/workspace/".length);
    const params = url.searchParams;
    if (request.method === "POST") {
      if (resource !== "commands") throw new ProductError("not_found", "Route not found", 404);
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        const buffer = Buffer.from(chunk); size += buffer.length;
        if (size > 512_000) throw new ProductError("too_large", "Request is too large", 413);
        chunks.push(buffer);
      }
      const data: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!data || typeof data !== "object" || !("command" in data) || typeof data.command !== "string" || !Object.hasOwn(productCommands, data.command)) throw new ProductError("invalid_request", "Unknown operation");
      const input = "input" in data ? data.input : {};
      json(response, 200, await executeProductCommand(tenantId, session.user.id, data.command as ProductCommand, input));
      return;
    }
    switch (resource) {
      case "navigation": json(response, 200, { ...await navigation(tenantId), folders: await listFolders(tenantId) }); break;
      case "notes": json(response, 200, await queryNotes(tenantId, noteFilter.parse({ ...Object.fromEntries(params), ...(params.has("offset") ? { offset: Number(params.get("offset")) } : {}) }))); break;
      case "note": json(response, 200, await getNote(tenantId, params.get("id") ?? "")); break;
      case "folders": json(response, 200, { folders: await listFolders(tenantId) }); break;
      case "tags": json(response, 200, { tags: await listTags(tenantId) }); break;
      case "history": json(response, 200, { revisions: await history(tenantId, params.get("id") ?? "") }); break;
      case "instructions": json(response, 200, await instructionChain(tenantId, params.get("folderId"))); break;
      case "graph": json(response, 200, await wikiGraph(tenantId)); break;
      default: throw new ProductError("not_found", "Route not found", 404);
    }
  } catch (error) {
    const failure = productError(error);
    if (failure.status === 500) console.error("workspace request failed", error instanceof Error ? error.message : "unknown");
    json(response, failure.status, failure);
  }
}
