import type { IncomingMessage, ServerResponse } from "node:http";

import { fromNodeHeaders } from "better-auth/node";
import { z } from "zod";

import { auth } from "../auth/auth.js";
import {
  ForbiddenError,
  NoteNotFoundError,
  NoteVersionConflictError,
} from "../domain/errors.js";
import { getCurrentMembership } from "../services/membership-service.js";
import {
  createNoteForTenant,
  listNotesForTenant,
  updateNoteForTenant,
} from "../services/note-service.js";
import { isTrustedMutationOrigin } from "./request-origin.js";

const MAX_TITLE_LENGTH = 200;
const MAX_BODY_LENGTH = 100_000;

const createNoteBodySchema = z.object({
  title: z.string().max(MAX_TITLE_LENGTH),
  body: z.string().max(MAX_BODY_LENGTH).optional().default(""),
});

const updateNoteBodySchema = z.object({
  title: z.string().max(MAX_TITLE_LENGTH),
  body: z.string().max(MAX_BODY_LENGTH),
  expectedVersion: z.number().int().positive(),
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

function noteIdFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  let pathname: string;
  try {
    pathname = new URL(url, "http://localhost").pathname;
  } catch {
    return null;
  }
  const match = /^\/api\/notes\/([^/]+)$/.exec(pathname);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
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
      authorUserId: session.user.id,
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

async function handleUpdateNote(
  request: IncomingMessage,
  response: ServerResponse,
  noteId: string,
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

  const parsed = updateNoteBodySchema.safeParse(rawBody);
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
    const note = await updateNoteForTenant({
      tenantId: activeOrganizationId,
      authorUserId: session.user.id,
      noteId,
      expectedVersion: parsed.data.expectedVersion,
      title,
      body: parsed.data.body,
    });
    writeJson(response, 200, note);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      writeJson(response, 403, { error: "forbidden" });
      return;
    }
    if (error instanceof NoteNotFoundError) {
      writeJson(response, 404, { error: "not_found" });
      return;
    }
    if (error instanceof NoteVersionConflictError) {
      writeJson(response, 409, {
        error: "version_conflict",
        currentVersion: error.currentVersion,
      });
      return;
    }
    console.error(
      "notes update failure",
      error instanceof Error ? error.message : "unknown",
    );
    writeJson(response, 500, { error: "internal_server_error" });
  }
}

/**
 * GET/POST /api/notes and PATCH /api/notes/:id — web session endpoints.
 * Tenant authority comes only from the Better Auth session's active organization.
 * Query/body/header tenantId values are never trusted.
 */
export async function handleNotesRoute(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const noteId = noteIdFromUrl(request.url);

  if (request.method === "GET" && !noteId) {
    await handleListNotes(request, response);
    return;
  }

  if (request.method === "POST" && !noteId) {
    await handleCreateNote(request, response);
    return;
  }

  if (request.method === "PATCH" && noteId) {
    await handleUpdateNote(request, response, noteId);
    return;
  }

  writeJson(response, 405, { error: "method_not_allowed" });
}
