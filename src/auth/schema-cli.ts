import { cimd } from "@better-auth/cimd";
import { mcp } from "@better-auth/mcp";
import { betterAuth } from "better-auth";
import { jwt, organization } from "better-auth/plugins";

import { env, betterAuthIssuer } from "../config/env.js";

export default betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  plugins: [
    organization(),
    jwt({ jwt: { issuer: betterAuthIssuer } }),
    mcp({
      loginPage: "/sign-in",
      consentPage: "/oauth/consent",
      resource: env.MCP_RESOURCE_URL,
      resources: [env.MCP_RESOURCE_URL],
      scopes: [
        "openid",
        "offline_access",
        "mcp:read",
        "mcp:write",
        "mcp:instructions",
        "mcp:admin",
      ],
    }),
    cimd({
      fetchClientMetadataResource: async () => new Response(),
      metadataProfile: "mcp-2026-07-28",
    }),
  ],
});
