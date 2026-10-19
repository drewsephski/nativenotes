import { observeRequest, requestPeer } from "./request-observation.js";
import { consumeRequestBudget } from "../services/request-budget.js";
import { handleProductRoute } from "./product-route.js";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import { toNodeHandler } from "@modelcontextprotocol/node";
import { toNodeHandler as toAuthNodeHandler } from "better-auth/node";

import { auth } from "../auth/auth.js";
import { env } from "../config/env.js";
import { protectedMcpHandler } from "../mcp/handler.js";
import {
  handleSignInRoute,
  handleSignUpRoute,
  handleGoogleSignInRoute,
} from "./auth-routes.js";
import { handleConsentRoute } from "./consent-route.js";
import { applyTrustedOriginCors } from "./cors.js";
import { handleNotesRoute } from "./notes-route.js";
import { renderHomePage } from "../ui/pages.js";
import { writeHtml } from "../ui/html.js";

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
  const handle = (request: IncomingMessage, response: ServerResponse) => {
    const pathname = new URL(request.url ?? "/", env.BETTER_AUTH_URL).pathname;

    if (request.method === "GET" && pathname === "/health") {
      writeJson(response, 200, { status: "ok" });
      return;
    }

    if (request.method === "GET" && pathname === "/") {
      writeHtml(response, 200, renderHomePage());
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
        console.error(
          "consent route failure",
          error instanceof Error ? error.message : "unknown",
        );
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

    if (pathname === "/sign-in/google") {
      void handleGoogleSignInRoute(request, response).catch(() => {
        if (!response.headersSent)
          writeJson(response, 500, { error: "internal_server_error" });
      });
      return;
    }

    if (pathname.startsWith("/api/workspace/")) {
      if (applyTrustedOriginCors(request, response)) return;
      void handleProductRoute(request, response);
      return;
    }

    if (pathname === "/api/notes" || pathname.startsWith("/api/notes/")) {
      // Cross-origin browser calls from the Next.js shell (e.g. :3001 → :3000).
      if (applyTrustedOriginCors(request, response)) return;
      void handleNotesRoute(request, response).catch(() => {
        console.error("notes route failure");
        if (!response.headersSent)
          writeJson(response, 500, { error: "internal_server_error" });
      });
      return;
    }

    if (
      pathname.startsWith("/api/auth") ||
      pathname.startsWith("/.well-known/")
    ) {
      // Cross-origin browser calls from the Next.js shell (e.g. :3001 → :3000).
      if (applyTrustedOriginCors(request, response)) return;
      void authHandler(request, response);
      return;
    }

    writeJson(response, 404, { error: "not_found" });
  };
  return (request: IncomingMessage, response: ServerResponse) => {
    observeRequest(request, response);
    const path = (request.url ?? "/").split("?")[0]!;
    // Session reads are not login attempts. Limit token exchanges and public auth mutations.
    const limited =
      request.method === "POST" &&
      (path.startsWith("/api/auth/") ||
        ["/sign-in", "/sign-up", "/sign-in/google"].includes(path));
    if (!limited) {
      handle(request, response);
      return;
    }
    void (async () => {
      const budget = await consumeRequestBudget(
        `auth:${requestPeer(request)}`,
        60,
      );
      if (!budget.allowed) {
        response.setHeader("retry-after", budget.retryAfter);
        writeJson(response, 429, {
          error: "rate_limited",
          message: "Too many authentication requests. Try again shortly.",
        });
        return;
      }
      handle(request, response);
    })().catch(() => {
      if (!response.headersSent)
        writeJson(response, 503, { error: "temporarily_unavailable" });
    });
  };
}

/** Test / harness helper. Production and `pnpm dev` use root `server.ts`. */
export function startNativeNotesServer(port = env.PORT) {
  const server = createServer(
    { requestTimeout: 30_000, headersTimeout: 15_000 },
    createNativeNotesRequestListener(),
  );
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
