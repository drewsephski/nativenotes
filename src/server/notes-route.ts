import type { IncomingMessage, ServerResponse } from "node:http";

import { fromNodeHeaders } from "better-auth/node";
import { z } from "zod";

import { auth } from "../auth/auth.js";
import { ForbiddenError } from "../domain/errors.js";
import { getCurrentMembership } from "../services/membership-service.js";
import {
  createNoteForTenant,
  listNotesForTenant,
} from "../services/note-service.js";
import { isTrustedMutationOrigin } from "./request-origin.js";

const MAX_TITLE_LENGTH = 200;
const MAX_BODY_LENGTH = 100_000;

const createNoteBodySchema = z.object({
  title: z.string().max(MAX_TITLE_LENGTH),
  body: z.string().max(MAX_BODY_LENGTH).optional().default(""),
});

function writeJson(
  response: ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  response.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (text.length === 0) {
    throw new SyntaxError("empty_body");
  }
  return JSON.parse(text) as unknown;
}

async function handleListNotes(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const headers = fromNodeHeaders(request.headers);
  const session = await auth.api.getSession({ headers });

  if (!session) {
    writeJson(response, 401, { error: "unauthorized" });
    return;
  }

  const activeOrganizationId = session.session.activeOrganizationId;
  if (!activeOrganizationId) {
    writeJson(response, 409, { error: "no_active_workspace" });
    return;
  }

  try {
    const context = await auth.$context;
    await getCurrentMembership(
      context.adapter,
      session.user.id,
      activeOrganizationId,
    );

    const result = await listNotesForTenant(activeOrganizationId);
    writeJson(response, 200, result);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      writeJson(response, 403, { error: "forbidden" });
      return;
    }
    console.error(
      "notes route failure",
      error instanceof Error ? error.message : "unknown",
    );
    writeJson(response, 500, { error: "internal_server_error" });
  }
}

async function handleCreateNote(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (!isTrustedMutationOrigin(request)) {
    writeJson(response, 403, { error: "forbidden" });
    return;
  }

  const headers = fromNodeHeaders(request.headers);
  const session = await auth.api.getSession({ headers });

  if (!session) {
    writeJson(response, 401, { error: "unauthorized" });
    return;
  }

  const activeOrganizationId = session.session.activeOrganizationId;
  if (!activeOrganizationId) {
    writeJson(response, 409, { error: "no_active_workspace" });
    return;
  }

  let rawBody: unknown;
  try {
    rawBody = await readJsonBody(request);
  } catch {
    writeJson(response, 400, { error: "invalid_request" });
    return;
  }

  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    writeJson(response, 400, { error: "invalid_request" });
    return;
  }

  const parsed = createNoteBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    writeJson(response, 400, { error: "invalid_request" });
    return;
  }

  const title = parsed.data.title.trim();
  if (title.length === 0) {
    writeJson(response, 400, { error: "invalid_request" });
    return;
  }

  try {
    const context = await auth.$context;
    await getCurrentMembership(
      context.adapter,
      session.user.id,
      activeOrganizationId,
    );

    // Tenant authority comes only from the session active organization.
    // Client-supplied tenantId (if present) is never used.
    const note = await createNoteForTenant({
      tenantId: activeOrganizationId,
      title,
      body: parsed.data.body,
    });
    writeJson(response, 201, note);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      writeJson(response, 403, { error: "forbidden" });
      return;
    }
    console.error(
      "notes create failure",
      error instanceof Error ? error.message : "unknown",
    );
    writeJson(response, 500, { error: "internal_server_error" });
  }
}

/**
 * GET/POST /api/notes — web session endpoints.
 * Tenant authority comes only from the Better Auth session's active organization.
 * Query/body/header tenantId values are never trusted.
 */
export async function handleNotesRoute(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method === "GET") {
    await handleListNotes(request, response);
    return;
  }

  if (request.method === "POST") {
    await handleCreateNote(request, response);
    return;
  }

  writeJson(response, 405, { error: "method_not_allowed" });
}
