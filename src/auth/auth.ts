import { betterAuth } from "better-auth";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { jwt, organization } from "better-auth/plugins";

import { env, betterAuthIssuer } from "../config/env.js";
import { combinedSchema, db } from "../db/client.js";
import {
  organizationConsentReferenceId,
  createGrantBindingExtension,
} from "./grant-binding.js";
import { getSelectedOrganization } from "./consent-selection.js";

import type { MembershipAdapter } from "../services/membership-service.js";

let getAuthAdapter: () => Promise<MembershipAdapter> = async () => {
  throw new Error("Better Auth is not initialized");
};

export const auth = betterAuth({
  appName: "NativeNotes",
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema: combinedSchema }),
  trustedOrigins: [env.BETTER_AUTH_URL],
  emailAndPassword: {
    enabled: true,
  },
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
      accessTokenExpiresIn: 900,
      refreshTokenExpiresIn: 2592000,
      refreshTokenReuseInterval: 30,
      extensions: [createGrantBindingExtension()],
      postLogin: {
        page: "/oauth/consent",
        // Redirect only until this request has an explicit org selection in ALS.
        // Returning true unconditionally loops authorize ↔ postLogin forever.
        shouldRedirect: async ({ scopes }) => {
          if (!scopes.includes("mcp:read")) return false;
          return getSelectedOrganization() === undefined;
        },
        consentReferenceId: async ({ user, scopes }) => {
          return organizationConsentReferenceId({
            user,
            scopes,
            adapter: await getAuthAdapter(),
          });
        },
      },
    }),
    cimd({
      fetchClientMetadataResource,
      metadataProfile: "mcp-2026-07-28",
    }),
  ],
});

getAuthAdapter = async () => (await auth.$context).adapter;
