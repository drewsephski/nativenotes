import type { IncomingMessage } from "node:http";

import { publicOrigin } from "../config/env.js";

/**
 * Better Auth origin/CSRF checks require Origin (or Referer) whenever cookies
 * are present. Server-side form forwards must preserve a trusted origin —
 * dropping it yields "Missing or null Origin" on Google/email auth.
 */
export function trustedForwardOrigin(request: IncomingMessage): string {
  const headerOrigin = request.headers.origin;
  if (typeof headerOrigin === "string" && headerOrigin.trim().length > 0) {
    return headerOrigin;
  }
  const referer = request.headers.referer;
  if (typeof referer === "string" && referer.trim().length > 0) {
    try {
      return new URL(referer).origin;
    } catch {
      // Fall through to the configured public origin.
    }
  }
  return publicOrigin;
}
