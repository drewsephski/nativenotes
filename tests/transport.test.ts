import { describe, expect, it } from "vitest";

import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";

import { mcpHandler, protectedMcpHandler } from "../src/mcp/handler.js";

const authInfo = {
  token: "test-token",
  clientId: "test-client",
  scopes: ["mcp:read"],
  resource: new URL("http://localhost:3000/mcp"),
  extra: {
    authContext: {
      userId: "user-a",
      tenantId: "org-a",
      scopes: ["mcp:read"],
      roles: ["member"],
    },
  },
};

function modernRequest(
  method: string,
  params: Record<string, unknown> = {},
  id = 1,
): Request {
  return new Request("http://localhost:3000/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": method,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params: {
        ...params,
        ...(method === "initialize"
          ? {
              protocolVersion: "2026-07-28",
              capabilities: {},
              clientInfo: { name: "test-client", version: "1.0.0" },
            }
          : {}),
        _meta: {
          [PROTOCOL_VERSION_META_KEY]: "2026-07-28",
          [CLIENT_INFO_META_KEY]: { name: "test-client", version: "1.0.0" },
          [CLIENT_CAPABILITIES_META_KEY]: {},
        },
      },
    }),
  });
}

describe("MCP transport boundary", () => {
  it("rejects anonymous requests before MCP dispatch", async () => {
    const response = await protectedMcpHandler(
      modernRequest("server/discover"),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
  });

  it("serves the current MCP protocol through the strict handler", async () => {
    const response = await mcpHandler.fetch(modernRequest("server/discover"), {
      authInfo,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      result: { supportedVersions: ["2026-07-28"] },
    });
  });

  it("rejects legacy MCP traffic", async () => {
    const request = new Request("http://localhost:3000/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "MCP-Protocol-Version": "2025-03-26",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "legacy", version: "1.0" },
        },
      }),
    });
    const response = await mcpHandler.fetch(request, { authInfo });
    expect(response.status).not.toBe(200);
  });
});
