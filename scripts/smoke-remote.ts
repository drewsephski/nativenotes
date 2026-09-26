#!/usr/bin/env node
/**
 * Read-only remote smoke checks for a deployed NativeNotes origin.
 *
 * Usage:
 *   pnpm smoke:remote https://www.nativenotes.app
 *   pnpm smoke:remote https://nativenotes.app   # follows apex→www (or reverse)
 *   pnpm smoke:remote https://nativenotes.vercel.app
 *
 * No secrets required. Does not perform authenticated OAuth.
 */
import { pathToFileURL } from "node:url";

type Json = Record<string, unknown>;

/** Hostnames that must never appear once the public domain is canonical. */
const INTERNAL_BACKEND_HOSTS = ["nativenotes.vercel.app"];

async function fetchJson(
  url: string,
  options?: { redirect?: RequestRedirect },
): Promise<{ status: number; body: Json; location?: string | null }> {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    redirect: options?.redirect ?? "manual",
  });
  const text = await response.text();
  try {
    return {
      status: response.status,
      body: text ? (JSON.parse(text) as Json) : {},
      location: response.headers.get("location"),
    };
  } catch {
    return {
      status: response.status,
      body: { raw: text.slice(0, 200) },
      location: response.headers.get("location"),
    };
  }
}

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function ok(message: string): void {
  console.log(`OK: ${message}`);
}

function stripWww(hostname: string): string {
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

function isApexWwwPair(left: string, right: string): boolean {
  try {
    const a = new URL(left);
    const b = new URL(right);
    return (
      a.protocol === b.protocol && stripWww(a.hostname) === stripWww(b.hostname)
    );
  } catch {
    return false;
  }
}

/**
 * Resolve Vercel apex↔www domain redirects before checking metadata.
 * Does not follow redirects to unrelated hosts.
 */
async function resolvePublicOrigin(requested: URL): Promise<URL> {
  const probe = await fetch(
    new URL("/health", requested.origin).toString(),
    { method: "GET", redirect: "manual", headers: { accept: "application/json" } },
  );

  if (probe.status >= 300 && probe.status < 400) {
    const location = probe.headers.get("location");
    if (!location) {
      fail(
        `/health returned ${probe.status} without Location (requested ${requested.origin})`,
      );
    }
    const next = new URL(location, requested.origin);
    if (!isApexWwwPair(requested.origin, next.origin)) {
      fail(
        `/health redirected to unrelated host ${next.origin} (from ${requested.origin})`,
      );
    }
    console.log(
      `NOTE: ${requested.origin} redirects to ${next.origin} — smoking effective origin`,
    );
    return new URL(next.origin);
  }

  return new URL(requested.origin);
}

function assertNoInternalBackendOrigin(
  label: string,
  body: Json,
  publicHostname: string,
): void {
  const isPublicCustomDomain =
    publicHostname === "nativenotes.app" ||
    publicHostname === "www.nativenotes.app";
  if (!isPublicCustomDomain) return;

  const serialized = JSON.stringify(body);
  for (const host of INTERNAL_BACKEND_HOSTS) {
    if (serialized.includes(host)) {
      fail(
        `${label} exposes internal backend host ${host}; issuer/resource must stay on ${publicHostname}`,
      );
    }
  }
}

export async function smokeRemote(baseInput: string): Promise<void> {
  const requested = new URL(baseInput);
  if (requested.protocol !== "https:" && requested.hostname !== "localhost") {
    fail("Smoke target should be an https:// origin (localhost http allowed)");
  }

  const base = await resolvePublicOrigin(requested);
  const origin = base.origin;
  const mcpResource = new URL("/mcp", origin).toString();
  const expectedIssuer = new URL("/api/auth", origin).toString().replace(/\/$/, "");

  const health = await fetchJson(new URL("/health", origin).toString());
  if (health.status !== 200 || health.body.status !== "ok") {
    fail(`/health expected 200 {status:ok}, got ${health.status} at ${origin}`);
  }
  ok(`GET /health (${origin})`);

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
      `issuer ${asMeta.body.issuer} does not match effective origin+/api/auth (${expectedIssuer}). Align BETTER_AUTH_URL with the public host Vercel serves (apex vs www).`,
    );
  }
  ok("GET authorization server metadata (issuer matches)");
  assertNoInternalBackendOrigin(
    "authorization server metadata",
    asMeta.body,
    base.hostname,
  );

  if (asMeta.body.client_id_metadata_document_supported !== true) {
    fail("authorization server must advertise client_id_metadata_document_supported: true");
  }
  ok("CIMD advertised (client_id_metadata_document_supported)");

  if (asMeta.body.authorization_response_iss_parameter_supported !== true) {
    fail(
      "authorization server must advertise authorization_response_iss_parameter_supported: true (RFC 9207)",
    );
  }
  ok("RFC 9207 issuer identification advertised");

  const codeChallenge = asMeta.body.code_challenge_methods_supported;
  if (!Array.isArray(codeChallenge) || !codeChallenge.includes("S256")) {
    fail("code_challenge_methods_supported must include S256");
  }
  ok("PKCE S256 advertised");

  const tokenAuthMethods = asMeta.body.token_endpoint_auth_methods_supported;
  if (
    !Array.isArray(tokenAuthMethods) ||
    !tokenAuthMethods.includes("none") ||
    !tokenAuthMethods.includes("private_key_jwt")
  ) {
    fail(
      "token_endpoint_auth_methods_supported must include none and private_key_jwt for ChatGPT CIMD intersection",
    );
  }
  ok("token endpoint auth intersection includes none + private_key_jwt");

  if (typeof asMeta.body.registration_endpoint === "string") {
    fail("registration_endpoint must be absent while DCR remains disabled");
  }
  ok("DCR registration_endpoint absent");

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

  const advertisedNormalized = advertised.replace(/\/$/, "");
  const expectedResource = mcpResource.replace(/\/$/, "");
  if (advertisedNormalized !== expectedResource) {
    let detail = `advertised MCP resource ${advertised} does not match ${mcpResource}`;
    try {
      const advertisedOrigin = new URL(advertised).origin;
      const issuerOrigin = new URL(issuer).origin;
      if (advertisedOrigin !== issuerOrigin) {
        detail += `. Split-brain: issuer origin is ${issuerOrigin} but resource origin is ${advertisedOrigin}. Set BETTER_AUTH_URL and MCP_RESOURCE_URL to the same public host (currently Vercel primary is www.nativenotes.app).`;
      }
    } catch {
      // keep base detail
    }
    fail(detail);
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
  assertNoInternalBackendOrigin(
    "protected resource metadata",
    prMeta.body,
    base.hostname,
  );

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
  const wwwAuth = mcp.headers.get("www-authenticate") ?? "";
  if (!/bearer/i.test(wwwAuth)) {
    fail("anonymous /mcp missing WWW-Authenticate: Bearer challenge");
  }
  ok("anonymous POST /mcp → 401 Bearer");

  console.log(`\nSmoke passed for ${origin}`);
  console.log(`Canonical MCP resource: ${mcpResource}`);
  console.log(`Canonical issuer: ${expectedIssuer}`);
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: pnpm smoke:remote https://www.nativenotes.app");
    process.exit(2);
  }
  void smokeRemote(target).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
