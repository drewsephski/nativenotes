import type { JWTPayload } from "jose";

import { tenantClaim, tenantRoleClaim } from "../config/env.js";
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
  const roles =
    role?.split(" ").filter(Boolean) ??
    (Array.isArray(membership.role)
      ? membership.role
      : [membership.role ?? "member"]);

  return { userId, tenantId, scopes, roles };
}
