/**
 * Minimal CORS for Better Auth when the Next.js shell runs on a different origin
 * (local: http://localhost:3001 → http://localhost:3000).
 *
 * Only allows origins already present in trustedOrigins. Never uses `*`.
 * Same-origin requests need no CORS headers.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

import { publicOrigin, trustedOrigins } from "../config/env.js";

const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, Authorization, X-Requested-With";

function requestOrigin(request: IncomingMessage): string | undefined {
  const origin = request.headers.origin;
  return typeof origin === "string" && origin.length > 0 ? origin : undefined;
}

function isTrustedCrossOrigin(origin: string): boolean {
  if (origin === publicOrigin) return false;
  return trustedOrigins.includes(origin);
}

/**
 * Apply CORS headers for a trusted cross-origin browser request.
 * Returns true when the request was fully handled (OPTIONS preflight).
 */
export function applyTrustedOriginCors(
  request: IncomingMessage,
  response: ServerResponse,
): boolean {
  const origin = requestOrigin(request);
  if (!origin || !isTrustedCrossOrigin(origin)) return false;

  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Credentials", "true");
  response.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
  response.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  response.setHeader("Vary", "Origin");

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return true;
  }

  return false;
}
