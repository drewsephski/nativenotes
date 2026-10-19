import { requireActiveGrant } from "../repositories/oauth-grant-tenant-repository.js";
import { getMcpPolicy } from "../repositories/connection-repository.js";
import type { JWTPayload } from "jose";

import { tenantClaim, tenantRoleClaim, env } from "../config/env.js";
import type { AuthContext } from "../domain/auth-context.js";
import { getCurrentMembership } from "../services/membership-service.js";
import type { MembershipAdapter } from "../services/membership-service.js";

function stringClaim(payload: JWTPayload, name: string): string | undefined {
  return typeof payload[name] === "string" ? payload[name] : undefined;
}

export async function buildAuthContext(
  payload: JWTPayload,
  adapter: MembershipAdapter,
): Promise<AuthContext> {
  const userId = stringClaim(payload, "sub");
  const tenantId = stringClaim(payload, tenantClaim);
  const scope = stringClaim(payload, "scope");
  const role = stringClaim(payload, tenantRoleClaim);

  if (!userId || !tenantId || !scope)
    throw new Error("Verified token is missing required NativeNotes claims");

  const membership = await getCurrentMembership(adapter, userId, tenantId);
  const scopes = scope.split(" ").filter(Boolean);
  const clientId = stringClaim(payload, "client_id");
  if (!clientId)
    throw new Error("Verified token is missing required NativeNotes claims");
  await requireActiveGrant(
    {
      userId,
      organizationId: tenantId,
      oauthClientId: clientId,
      resource: env.MCP_RESOURCE_URL,
      scopes,
    },
    payload[`${env.TENANT_CLAIM_NAMESPACE}/grant_version`],
  );
  const policy = await getMcpPolicy(tenantId);
  const roles =
    role?.split(" ").filter(Boolean) ??
    (Array.isArray(membership.role)
      ? membership.role
      : [membership.role ?? "member"]);

  return {
    userId,
    tenantId,
    scopes,
    roles,
    requireReview: policy.requireReview,
    ...(stringClaim(payload, "client_id")
      ? { oauthClientId: stringClaim(payload, "client_id") }
      : {}),
  };
}
