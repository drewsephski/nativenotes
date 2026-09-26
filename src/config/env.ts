import "dotenv/config";
import { z } from "zod";

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

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: urlWithoutQueryOrFragment,
  MCP_RESOURCE_URL: resourceUrl,
  TENANT_CLAIM_NAMESPACE: z
    .string()
    .url()
    .transform((value) => value.replace(/\/$/, "")),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

export const env = schema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  MCP_RESOURCE_URL: process.env.MCP_RESOURCE_URL,
  TENANT_CLAIM_NAMESPACE: process.env.TENANT_CLAIM_NAMESPACE,
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
});

export const tenantClaim = `${env.TENANT_CLAIM_NAMESPACE}/tenant_id`;
export const tenantRoleClaim = `${env.TENANT_CLAIM_NAMESPACE}/tenant_role`;
export const betterAuthIssuer = new URL("/api/auth", env.BETTER_AUTH_URL)
  .toString()
  .replace(/\/$/, "");
