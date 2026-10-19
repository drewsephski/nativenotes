import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export function observeRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const requestId = randomUUID();
  const started = performance.now();
  response.setHeader("x-request-id", requestId);
  response.once("finish", () => {
    const durationMs = Math.round(performance.now() - started);
    // Do not log query strings, bodies, cookies or tokens.
    console.info("[request]", {
      requestId,
      method: request.method,
      path: (request.url ?? "/").split("?")[0],
      status: response.statusCode,
      durationMs,
      slow: durationMs >= 5000,
    });
  });
}

/** Trust Vercel's overwritten proxy header only on Vercel; otherwise use the peer. */
export function requestPeer(request: IncomingMessage) {
  const header =
    process.env.VERCEL === "1"
      ? request.headers["x-vercel-forwarded-for"]
      : undefined;
  return typeof header === "string"
    ? header.split(",")[0]!.trim()
    : (request.socket.remoteAddress ?? "unknown");
}
