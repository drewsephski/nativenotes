import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { toNodeHandler } from "@modelcontextprotocol/node";
import { toNodeHandler as toAuthNodeHandler } from "better-auth/node";

import { auth } from "../auth/auth.js";
import { env } from "../config/env.js";
import { protectedMcpHandler } from "../mcp/handler.js";
import { handleSignInRoute, handleSignUpRoute } from "./auth-routes.js";
import { handleConsentRoute } from "./consent-route.js";

const authHandler = toAuthNodeHandler(auth);
const mcpNodeHandler = toNodeHandler(
  { fetch: protectedMcpHandler },
  { maxRequestBodySize: 4 * 1024 * 1024 },
);

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

export function createNativeNotesRequestListener() {
  return (request: IncomingMessage, response: ServerResponse) => {
    const pathname = new URL(request.url ?? "/", env.BETTER_AUTH_URL).pathname;

    if (request.method === "GET" && pathname === "/health") {
      writeJson(response, 200, { status: "ok" });
      return;
    }

    if (request.method === "GET" && pathname === "/") {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(
        `<!doctype html><html><body><h1>NativeNotes</h1><p>Local auth surface for MCP OAuth proofs.</p><p><a href="/sign-in">Sign in</a> · <a href="/sign-up">Sign up</a></p></body></html>`,
      );
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
      void handleConsentRoute(request, response).catch((error) => {
        console.error("consent route failure", error instanceof Error ? error.message : "unknown");
        if (!response.headersSent)
          writeJson(response, 500, { error: "internal_server_error" });
      });
      return;
    }

    if (pathname === "/sign-in") {
      void handleSignInRoute(request, response).catch(() => {
        if (!response.headersSent)
          writeJson(response, 500, { error: "internal_server_error" });
      });
      return;
    }

    if (pathname === "/sign-up") {
      void handleSignUpRoute(request, response).catch(() => {
        if (!response.headersSent)
          writeJson(response, 500, { error: "internal_server_error" });
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

    writeJson(response, 404, { error: "not_found" });
  };
}

/** Test / harness helper. Production and `pnpm dev` use root `server.ts`. */
export function startNativeNotesServer(port = env.PORT) {
  const server = createServer(createNativeNotesRequestListener());
  return new Promise<{
    server: ReturnType<typeof createServer>;
    port: number;
    baseUrl: string;
  }>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const resolvedPort =
        address && typeof address === "object" ? address.port : port;
      const baseUrl = `http://127.0.0.1:${resolvedPort}`;
      console.log(`NativeNotes listening on ${baseUrl}`);
      resolve({ server, port: resolvedPort, baseUrl });
    });
  });
}
