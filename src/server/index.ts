import { createServer } from "node:http";

import { toNodeHandler } from "@modelcontextprotocol/node";
import { toNodeHandler as toAuthNodeHandler } from "better-auth/node";

import { auth } from "../auth/auth.js";
import { env } from "../config/env.js";
import { protectedMcpHandler } from "../mcp/handler.js";
import { handleConsentRoute } from "./consent-route.js";

const authHandler = toAuthNodeHandler(auth);
const mcpNodeHandler = toNodeHandler(
  { fetch: protectedMcpHandler },
  { maxRequestBodySize: 4 * 1024 * 1024 },
);

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? "/", env.BETTER_AUTH_URL).pathname;

  if (request.method === "GET" && pathname === "/health") {
    response.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (pathname === "/mcp") {
    void mcpNodeHandler(
      request as unknown as Parameters<typeof mcpNodeHandler>[0],
      response,
    );
    return;
  }

  if (pathname === "/oauth/consent") {
    void handleConsentRoute(request, response).catch(() => {
      if (!response.headersSent)
        response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "internal_server_error" }));
    });
    return;
  }

  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/.well-known/")
  ) {
    void authHandler(request, response);
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not_found" }));
});

server.listen(env.PORT, () => {
  console.log(`Hjarni listening on ${env.BETTER_AUTH_URL}`);
});
