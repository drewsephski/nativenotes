import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { smokeRemote } from "../scripts/smoke-remote.js";
const origin = "https://nativenotes.app";
let metadata: Record<string, unknown>;
let resource: Record<string, unknown>;
let redirectHealth = false;
beforeEach(() => {
  redirectHealth = false;
  metadata = {
    issuer: `${origin}/api/auth`,
    jwks_uri: `${origin}/api/auth/jwks`,
    authorization_endpoint: `${origin}/api/auth/oauth2/authorize`,
    token_endpoint: `${origin}/api/auth/oauth2/token`,
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
  };
  resource = {
    resource: `${origin}/mcp`,
    authorization_servers: [`${origin}/api/auth`],
  };
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const path = new URL(input).pathname;
      if (path === "/health")
        return redirectHealth
          ? new Response(null, {
              status: 308,
              headers: { location: "https://www.nativenotes.app/health" },
            })
          : Response.json({ status: "ok" });
      if (path.includes("oauth-authorization-server"))
        return Response.json(metadata);
      if (path.includes("oauth-protected-resource"))
        return Response.json(resource);
      if (path === "/api/auth/jwks")
        return Response.json({ keys: [{ kty: "OKP" }] });
      return new Response(null, {
        status: 401,
        headers: {
          "www-authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`,
        },
      });
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("passes a complete canonical same-origin discovery set", async () => {
  await expect(smokeRemote(origin)).resolves.toBeUndefined();
});
it("rejects apex redirects instead of accepting a different canonical host", async () => {
  redirectHealth = true;
  await expect(smokeRemote(origin)).rejects.toThrow(/health/);
});
it("rejects a missing authorization server", async () => {
  delete resource.authorization_servers;
  await expect(smokeRemote(origin)).rejects.toThrow(/authorization_servers/);
});
it("rejects an internal hostname anywhere in metadata", async () => {
  metadata.revocation_endpoint =
    "https://alternate-backend.vercel.app/api/auth/oauth2/revoke";
  await expect(smokeRemote(origin)).rejects.toThrow(/internal backend/);
});
it("rejects an issuer or resource mismatch", async () => {
  metadata.issuer = "https://www.nativenotes.app/api/auth";
  await expect(smokeRemote(origin)).rejects.toThrow(/issuer/);
  metadata.issuer = `${origin}/api/auth`;
  resource.resource = "https://www.nativenotes.app/mcp";
  await expect(smokeRemote(origin)).rejects.toThrow(/resource/);
});
