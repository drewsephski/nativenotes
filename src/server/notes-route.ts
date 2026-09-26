import type { IncomingMessage, ServerResponse } from "node:http";

import { fromNodeHeaders } from "better-auth/node";

import { auth } from "../auth/auth.js";
import { ForbiddenError } from "../domain/errors.js";
import { getCurrentMembership } from "../services/membership-service.js";
import { listNotesForTenant } from "../services/note-service.js";

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

/**
 * GET /api/notes — web session endpoint.
 * Tenant authority comes only from the Better Auth session's active organization.
 * Query/body/header tenantId values are never trusted.
 */
export async function handleNotesRoute(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "GET") {
    writeJson(response, 405, { error: "method_not_allowed" });
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
