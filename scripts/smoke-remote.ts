#!/usr/bin/env node
/**
 * Read-only remote smoke checks for a deployed NativeNotes origin.
 *
 * Usage:
 *   pnpm smoke:remote https://your-domain.com
 *
 * No secrets required. Does not perform authenticated OAuth.
 */
import { pathToFileURL } from "node:url";

type Json = Record<string, unknown>;

async function fetchJson(url: string): Promise<{ status: number; body: Json }> {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    redirect: "manual",
  });
  const text = await response.text();
  try {
    return {
      status: response.status,
      body: text ? (JSON.parse(text) as Json) : {},
    };
  } catch {
    return { status: response.status, body: { raw: text.slice(0, 200) } };
  }
}

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function ok(message: string): void {
  console.log(`OK: ${message}`);
}

export async function smokeRemote(baseInput: string): Promise<void> {
  const base = new URL(baseInput);
  if (base.protocol !== "https:" && base.hostname !== "localhost") {
    fail("Smoke target should be an https:// origin (localhost http allowed)");
  }

  const origin = base.origin;
  const mcpResource = new URL("/mcp", origin).toString();

  const health = await fetchJson(new URL("/health", origin).toString());
  if (health.status !== 200 || health.body.status !== "ok") {
    fail(`/health expected 200 {status:ok}, got ${health.status}`);
  }
  ok("GET /health");

  const expectedIssuer = new URL("/api/auth", origin).toString().replace(/\/$/, "");

  const asMeta = await fetchJson(
    new URL("/api/auth/.well-known/oauth-authorization-server", origin).toString(),
  );
  if (asMeta.status !== 200) {
    fail(`authorization server metadata HTTP ${asMeta.status}`);
  }
  if (typeof asMeta.body.issuer !== "string") {
    fail("authorization server metadata missing issuer");
  }
  const issuer = asMeta.body.issuer.replace(/\/$/, "");
  if (issuer !== expectedIssuer) {
    fail(
      `issuer ${asMeta.body.issuer} does not match BETTER_AUTH_URL+/api/auth (${expectedIssuer})`,
    );
  }
  ok("GET authorization server metadata (issuer matches)");

  const prMeta = await fetchJson(
    new URL("/.well-known/oauth-protected-resource", origin).toString(),
  );
  if (prMeta.status !== 200) {
    fail(`protected resource metadata HTTP ${prMeta.status}`);
  }
  const resources = prMeta.body.resource ?? prMeta.body.resources;
  const advertised =
    typeof resources === "string"
      ? resources
      : Array.isArray(resources)
        ? resources[0]
        : undefined;
  if (typeof advertised !== "string") {
    fail("protected resource metadata missing resource");
  }
  if (advertised.replace(/\/$/, "") !== mcpResource.replace(/\/$/, "")) {
    fail(
      `advertised MCP resource ${advertised} does not match MCP_RESOURCE_URL ${mcpResource}`,
    );
  }
  const authServers = prMeta.body.authorization_servers;
  if (Array.isArray(authServers) && authServers.length > 0) {
    const advertisedIssuer = String(authServers[0]).replace(/\/$/, "");
    if (advertisedIssuer !== expectedIssuer) {
      fail(
        `protected resource authorization_servers[0]=${authServers[0]} does not match ${expectedIssuer}`,
      );
    }
  }
  ok("GET protected resource metadata (canonical /mcp)");

  const jwks = await fetchJson(new URL("/api/auth/jwks", origin).toString());
  if (jwks.status !== 200 || !Array.isArray(jwks.body.keys)) {
    fail(`JWKS expected keys[], got HTTP ${jwks.status}`);
  }
  ok("GET JWKS");

  const mcp = await fetch(mcpResource, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    }),
  });
  if (mcp.status !== 401) {
    fail(`anonymous POST /mcp expected 401, got ${mcp.status}`);
  }
  const www = mcp.headers.get("www-authenticate") ?? "";
  if (!/bearer/i.test(www)) {
    fail("anonymous /mcp missing WWW-Authenticate: Bearer challenge");
  }
  ok("anonymous POST /mcp → 401 Bearer");

  console.log(`\nSmoke passed for ${origin}`);
  console.log(`Canonical MCP resource: ${mcpResource}`);
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: pnpm smoke:remote https://your-domain.com");
    process.exit(2);
  }
  void smokeRemote(target).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
