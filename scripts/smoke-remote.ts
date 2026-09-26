#!/usr/bin/env node
/**
 * Read-only remote smoke checks for a deployed NativeNotes origin.
 *
 * Usage:
 *   pnpm smoke:remote https://nativenotes.app
 *
 * No secrets required. Does not perform authenticated OAuth.
 */
import { pathToFileURL } from "node:url";

type Json = Record<string, unknown>;

/** Hostnames that must never appear once the public domain is canonical. */
const INTERNAL_BACKEND_HOSTS = [
  "nativenotes.vercel.app",
  ...(process.env.NATIVE_NOTES_BACKEND_ORIGIN
    ? [new URL(process.env.NATIVE_NOTES_BACKEND_ORIGIN).hostname]
    : []),
];

async function fetchJson(
  url: string,
): Promise<{ status: number; body: Json; location?: string | null }> {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
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
  throw new Error(`FAIL: ${message}`);
}

function ok(message: string): void {
  console.log(`OK: ${message}`);
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
  const internalHost =
    INTERNAL_BACKEND_HOSTS.find((host) => serialized.includes(host)) ??
    serialized.match(/[a-z0-9-]+\.vercel\.app/i)?.[0];
  if (internalHost) {
    fail(
      `${label} exposes internal backend host ${internalHost}; issuer/resource must stay on ${publicHostname}`,
    );
  }
}

export async function smokeRemote(baseInput: string): Promise<void> {
  const requested = new URL(baseInput);
  if (
    requested.protocol !== "https:" &&
    !(requested.protocol === "http:" && requested.hostname === "localhost")
  ) {
    fail("Smoke target should be an https:// origin (localhost http allowed)");
  }

  if (
    requested.pathname !== "/" ||
    requested.search ||
    requested.hash ||
    requested.username ||
    requested.password
  ) {
    fail(
      "Smoke target must be an origin without path, query, fragment, or credentials",
    );
  }
  const base = requested;
  const origin = base.origin;
  const mcpResource = new URL("/mcp", origin).toString();
  const expectedIssuer = new URL("/api/auth", origin)
    .toString()
    .replace(/\/$/, "");

  const health = await fetchJson(new URL("/health", origin).toString());
  if (health.status !== 200 || health.body.status !== "ok") {
    fail(`/health expected 200 {status:ok}, got ${health.status} at ${origin}`);
  }
  ok(`GET /health (${origin})`);

  const asMeta = await fetchJson(
    new URL(
      "/api/auth/.well-known/oauth-authorization-server",
      origin,
    ).toString(),
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
      `issuer ${asMeta.body.issuer} does not match requested origin+/api/auth (${expectedIssuer}). Align BETTER_AUTH_URL with the canonical public origin.`,
    );
  }
  ok("GET authorization server metadata (issuer matches)");
  assertNoInternalBackendOrigin(
    "authorization server metadata",
    asMeta.body,
    base.hostname,
  );

  if (asMeta.body.client_id_metadata_document_supported !== true) {
    fail(
      "authorization server must advertise client_id_metadata_document_supported: true",
    );
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
        detail += `. Split-brain: issuer origin is ${issuerOrigin} but resource origin is ${advertisedOrigin}. Set BETTER_AUTH_URL and MCP_RESOURCE_URL to the same public host (https://nativenotes.app after cutover).`;
      }
    } catch {
      // keep base detail
    }
    fail(detail);
  }

  const authServers = prMeta.body.authorization_servers;
  if (
    !Array.isArray(authServers) ||
    authServers.length !== 1 ||
    authServers[0] !== expectedIssuer
  ) {
    fail(
      `protected resource authorization_servers must equal ["${expectedIssuer}"]`,
    );
  }
  ok("GET protected resource metadata (canonical /mcp)");
  assertNoInternalBackendOrigin(
    "protected resource metadata",
    prMeta.body,
    base.hostname,
  );

  const expectedJwks = new URL("/api/auth/jwks", origin).toString();
  if (asMeta.body.jwks_uri !== expectedJwks)
    fail(`jwks_uri must equal ${expectedJwks}`);
  for (const field of ["authorization_endpoint", "token_endpoint"]) {
    const value = asMeta.body[field];
    if (typeof value !== "string" || new URL(value).origin !== origin) {
      fail(`${field} must use the canonical public origin`);
    }
  }
  const jwks = await fetchJson(expectedJwks);
  if (
    jwks.status !== 200 ||
    !Array.isArray(jwks.body.keys) ||
    jwks.body.keys.length === 0
  ) {
    fail(`JWKS expected keys[], got HTTP ${jwks.status}`);
  }
  ok("GET JWKS");

  const mcp = await fetch(mcpResource, {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
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
  const metadataMatch = /resource_metadata="([^"]+)"/.exec(wwwAuth);
  const metadataUrl = metadataMatch?.[1];
  if (
    !metadataUrl ||
    new URL(metadataUrl).origin !== origin ||
    !new URL(metadataUrl).pathname.startsWith(
      "/.well-known/oauth-protected-resource",
    )
  ) {
    fail(
      "MCP Bearer challenge must point to public protected-resource metadata",
    );
  }
  const challengeMetadata = await fetchJson(metadataUrl);
  if (
    challengeMetadata.status !== 200 ||
    challengeMetadata.body.resource !== mcpResource
  ) {
    fail("MCP challenge metadata must resolve to the canonical resource");
  }
  assertNoInternalBackendOrigin(
    "MCP challenge metadata",
    challengeMetadata.body,
    base.hostname,
  );
  ok("anonymous POST /mcp → 401 Bearer (public metadata reachable)");

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
    console.error("Usage: pnpm smoke:remote https://nativenotes.app");
    process.exit(2);
  }
  void smokeRemote(target).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
