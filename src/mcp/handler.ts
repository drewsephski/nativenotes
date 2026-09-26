import { createMcpHandler, type AuthInfo } from "@modelcontextprotocol/server";
import { requireMcpAuth } from "@better-auth/mcp";

import { auth } from "../auth/auth.js";
import { betterAuthIssuer, env } from "../config/env.js";
import { ForbiddenError } from "../domain/errors.js";
import { buildAuthContext } from "./tenant-auth.js";
import { createMcpServer } from "./note-list.js";

export const mcpHandler = createMcpHandler(
  ({ authInfo }) => {
    const authContext = authInfo?.extra?.authContext;
    if (!authContext || typeof authContext !== "object")
      throw new Error("MCP auth context is unavailable");
    return createMcpServer(
      authContext as Parameters<typeof createMcpServer>[0],
    );
  },
  { legacy: "reject", responseMode: "json" },
);

function bearerToken(request: Request): string {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return "authenticated";
  return header.slice("Bearer ".length);
}

function authFailureResponse(error: unknown): Response {
  if (error instanceof ForbiddenError) {
    return Response.json(
      {
        error: "forbidden",
        error_description: error.message,
      },
      {
        status: 403,
        headers: { "cache-control": "no-store" },
      },
    );
  }

  return Response.json(
    {
      error: "unauthorized",
      error_description: "Authentication failed",
    },
    {
      status: 401,
      headers: { "cache-control": "no-store" },
    },
  );
}

export const protectedMcpHandler = requireMcpAuth(
  auth,
  async (request, claims) => {
    try {
      const context = await auth.$context;
      const authContext = await buildAuthContext(claims, context.adapter);
      const authInfo: AuthInfo = {
        token: bearerToken(request),
        clientId:
          typeof claims.client_id === "string" ? claims.client_id : "unknown",
        scopes: authContext.scopes,
        resource: new URL(env.MCP_RESOURCE_URL),
        extra: { authContext },
      };
      if (typeof claims.exp === "number") authInfo.expiresAt = claims.exp;

      return mcpHandler.fetch(request, { authInfo });
    } catch (error) {
      if (error instanceof ForbiddenError) return authFailureResponse(error);
      if (
        error instanceof Error &&
        error.message.includes("missing required NativeNotes claims")
      ) {
        return authFailureResponse(error);
      }
      console.error("MCP auth handler failure");
      return authFailureResponse(error);
    }
  },
  {
    resource: env.MCP_RESOURCE_URL,
    issuer: betterAuthIssuer,
    jwksUrl: `${betterAuthIssuer}/jwks`,
    requiredScopes: ["mcp:read"],
  },
);
