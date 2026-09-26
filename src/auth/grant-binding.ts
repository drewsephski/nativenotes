import type { OAuthProviderExtension } from "@better-auth/oauth-provider";
import { APIError } from "better-auth";

import { env, tenantClaim, tenantRoleClaim } from "../config/env.js";
import { getSelectedOrganization } from "./consent-selection.js";
import { ensureGrantBinding } from "../repositories/oauth-grant-tenant-repository.js";
import { getCurrentMembership } from "../services/membership-service.js";
import type { MembershipAdapter } from "../services/membership-service.js";

const organizationScope = "mcp:read";

function badGrant(message: string): never {
  throw new APIError("BAD_REQUEST", {
    error: "invalid_grant",
    error_description: message,
  });
}

export function createGrantBindingExtension(): OAuthProviderExtension {
  return {
    claims: {
      accessToken: async ({
        ctx,
        user,
        client,
        scopes,
        referenceId,
        resources,
      }) => {
        if (!scopes.includes(organizationScope)) return {};
        if (!user?.id || !referenceId)
          badGrant("An organization-bound grant is required");

        const organizationId = referenceId;
        const membership = await getCurrentMembership(
          ctx.context.adapter,
          user.id,
          organizationId,
        );
        const resource = resources?.[0] ?? env.MCP_RESOURCE_URL;
        const binding = await ensureGrantBinding({
          userId: user.id,
          oauthClientId: client.clientId,
          organizationId,
          resource,
          scopes,
        });

        return {
          [tenantClaim]: binding.organizationId,
          [tenantRoleClaim]: Array.isArray(membership.role)
            ? membership.role.join(" ")
            : (membership.role ?? "member"),
        };
      },
    },
  };
}

export async function organizationConsentReferenceId(context: {
  user?: { id: string };
  scopes: string[];
  adapter: MembershipAdapter;
}): Promise<string | undefined> {
  if (!context.scopes.includes(organizationScope)) return undefined;
  if (!context.user?.id) badGrant("A signed-in user is required");

  const selected = getSelectedOrganization();
  if (!selected) badGrant("Explicit organization selection is required");

  await getCurrentMembership(context.adapter, context.user.id, selected);
  return selected;
}
