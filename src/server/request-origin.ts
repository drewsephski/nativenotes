import type { IncomingMessage } from "node:http";

import { publicOrigin, trustedOrigins } from "../config/env.js";

/**
 * Resolve Origin (preferred) or Referer origin for browser requests.
 * Returns undefined when neither is present / parseable.
 */
export function requestOrigin(request: IncomingMessage): string | undefined {
  const headerOrigin = request.headers.origin;
  if (typeof headerOrigin === "string" && headerOrigin.trim().length > 0) {
    return headerOrigin.trim();
  }
  const referer = request.headers.referer;
  if (typeof referer === "string" && referer.trim().length > 0) {
    try {
      return new URL(referer).origin;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Better Auth origin/CSRF checks require Origin (or Referer) whenever cookies
 * are present. Server-side form forwards must preserve a trusted origin —
 * dropping it yields "Missing or null Origin" on Google/email auth.
 */
export function trustedForwardOrigin(request: IncomingMessage): string {
  return requestOrigin(request) ?? publicOrigin;
}

/**
 * Cookie-authenticated mutations must come from a trusted web origin.
 * Does not use wildcards. Missing Origin/Referer is rejected.
 */
export function isTrustedMutationOrigin(request: IncomingMessage): boolean {
  const origin = requestOrigin(request);
  if (!origin) return false;
  return trustedOrigins.includes(origin);
}
