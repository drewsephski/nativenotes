import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

import { getNativeNotesApiUrl } from "@/lib/config";

/**
 * Better Auth client talking to the existing Node backend.
 * Do not duplicate server auth config in Next.js.
 *
 * Web active workspace is session UI state. MCP tenant is authorization-grant state.
 * Calling organization.setActive here must never mutate oauth_grant_tenant /
 * MCP consent grant binding — those stay grant-scoped on the backend.
 */
export const authClient = createAuthClient({
  baseURL: getNativeNotesApiUrl(),
  plugins: [organizationClient()],
});

export const {
  useSession,
  useListOrganizations,
  useActiveOrganization,
  signOut,
} = authClient;
