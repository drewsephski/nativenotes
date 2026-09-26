import "dotenv/config";
import { z } from "zod";

import {
  assertProductionHttpsOrigin,
  resolveRuntimeDatabaseUrl,
} from "./database-url.js";

const urlWithoutQueryOrFragment = z
  .string()
  .url()
  .refine((value) => {
    const parsed = new URL(value);
    return (
      !parsed.search && !parsed.hash && !parsed.username && !parsed.password
    );
  }, "must not include query, fragment, or credentials");

const resourceUrl = urlWithoutQueryOrFragment.refine((value) => {
  const parsed = new URL(value);
  return (
    parsed.protocol === "https:" ||
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "[::1]"
  );
}, "must use HTTPS except on loopback hosts");

const nodeEnvSchema = z
  .enum(["development", "test", "production"])
  .default("development");

const optionalNonEmptyString = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().min(1).optional(),
);

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_UNPOOLED: z.string().min(1).optional(),
  TEST_DATABASE_URL: z.string().min(1).optional(),
  PRODUCTION_DATABASE_URL: z.string().min(1).optional(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: urlWithoutQueryOrFragment,
  MCP_RESOURCE_URL: resourceUrl,
  TENANT_CLAIM_NAMESPACE: z
    .string()
    .url()
    .transform((value) => value.replace(/\/$/, "")),
  TRUSTED_ORIGINS: z.string().optional(),
  NEON_BRANCH: z.string().optional(),
  GOOGLE_CLIENT_ID: optionalNonEmptyString,
  GOOGLE_CLIENT_SECRET: optionalNonEmptyString,
  NODE_ENV: nodeEnvSchema,
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

const nodeEnv = nodeEnvSchema.parse(process.env.NODE_ENV);

const runtimeDatabaseUrl = resolveRuntimeDatabaseUrl({
  DATABASE_URL: process.env.DATABASE_URL,
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
  NODE_ENV: nodeEnv,
});

export const env = schema.parse({
  DATABASE_URL: runtimeDatabaseUrl,
  DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
  PRODUCTION_DATABASE_URL: process.env.PRODUCTION_DATABASE_URL,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  MCP_RESOURCE_URL: process.env.MCP_RESOURCE_URL,
  TENANT_CLAIM_NAMESPACE: process.env.TENANT_CLAIM_NAMESPACE,
  TRUSTED_ORIGINS: process.env.TRUSTED_ORIGINS,
  NEON_BRANCH: process.env.NEON_BRANCH,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  NODE_ENV: nodeEnv,
  PORT: process.env.PORT,
});

if (env.NODE_ENV === "production") {
  assertProductionHttpsOrigin(env.BETTER_AUTH_URL, "BETTER_AUTH_URL");
  assertProductionHttpsOrigin(env.MCP_RESOURCE_URL, "MCP_RESOURCE_URL");
}

/** True when both Google OAuth credentials are configured. */
export const googleOAuthEnabled = Boolean(
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET,
);

/**
 * Better Auth Google callback path (basePath `/api/auth` + `/callback/google`).
 * Confirmed against better-auth 1.7.6 `getOAuthCallbackPath`.
 */
export const googleOAuthCallbackPath = "/api/auth/callback/google";

/** Canonical public origin (no path). Prefer configuring BETTER_AUTH_URL to this. */
export const publicOrigin = new URL(env.BETTER_AUTH_URL).origin;

/**
 * Local Next.js shell (`apps/web`) runs on :3001 while the auth API stays on :3000.
 * Injected only outside production so production trusted-origin behavior is unchanged.
 */
const localWebDevOrigins =
  env.NODE_ENV !== "production" ? ["http://localhost:3001"] : [];

export const trustedOrigins: string[] = [
  publicOrigin,
  ...localWebDevOrigins,
  ...(env.TRUSTED_ORIGINS
    ? env.TRUSTED_ORIGINS.split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : []),
];

export const useSecureCookies =
  env.NODE_ENV === "production" ||
  new URL(env.BETTER_AUTH_URL).protocol === "https:";

export const tenantClaim = `${env.TENANT_CLAIM_NAMESPACE}/tenant_id`;
export const tenantRoleClaim = `${env.TENANT_CLAIM_NAMESPACE}/tenant_role`;
export const betterAuthIssuer = new URL("/api/auth", env.BETTER_AUTH_URL)
  .toString()
  .replace(/\/$/, "");
