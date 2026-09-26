#!/usr/bin/env node
/**
 * Validates ChatGPT's published CIMD document through Better Auth's
 * SSRF-protected Node fetch + CIMD metadata validator (same path production uses).
 * No secrets.
 *
 * Usage:
 *   pnpm tsx scripts/validate-chatgpt-cimd.ts
 *   pnpm tsx scripts/validate-chatgpt-cimd.ts https://chatgpt.com/oauth/client.json
 */
import { pathToFileURL } from "node:url";

import { validateCimdMetadata } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";

const DEFAULT_CIMD = "https://chatgpt.com/oauth/client.json";

export async function validateChatgptCimd(
  clientIdUrl = DEFAULT_CIMD,
): Promise<void> {
  const response = await fetchClientMetadataResource(clientIdUrl, {
    headers: { accept: "application/json" },
    redirect: "manual",
  });

  if (!response.ok) {
    console.error("FAIL: CIMD HTTPS fetch rejected", {
      clientIdUrl,
      status: response.status,
    });
    process.exit(1);
  }

  const raw: unknown = await response.json();
  const result = validateCimdMetadata(clientIdUrl, raw, {
    metadataProfile: "mcp-2026-07-28",
  });

  if (!result.valid) {
    console.error("FAIL: Better Auth CIMD validation rejected document", {
      clientIdUrl,
      error: result.error,
    });
    process.exit(1);
  }

  const metadata = result.metadata;
  console.log("OK: Better Auth CIMD accepted ChatGPT metadata via @better-auth/cimd/node");
  console.log(
    JSON.stringify(
      {
        client_id: metadata.client_id,
        client_name: metadata.client_name,
        redirect_uris: metadata.redirect_uris,
        token_endpoint_auth_method: metadata.token_endpoint_auth_method,
        token_endpoint_auth_methods_supported:
          "token_endpoint_auth_methods_supported" in metadata
            ? metadata.token_endpoint_auth_methods_supported
            : undefined,
        grant_types: metadata.grant_types,
        response_types: metadata.response_types,
        jwks_uri: metadata.jwks_uri,
        token_endpoint_auth_signing_alg:
          "token_endpoint_auth_signing_alg" in metadata
            ? metadata.token_endpoint_auth_signing_alg
            : undefined,
        warnings: result.warnings,
      },
      null,
      2,
    ),
  );
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  void validateChatgptCimd(process.argv[2] ?? DEFAULT_CIMD).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
