import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { oauthGrantTenant, workspaceMcpPolicy } from "../db/schema.js";
import { oauthClient } from "../db/auth-schema.js";

export async function getMcpPolicy(tenantId: string) {
  const [policy] = await db
    .select()
    .from(workspaceMcpPolicy)
    .where(eq(workspaceMcpPolicy.tenantId, tenantId));
  return { requireReview: policy?.requireReview ?? false };
}

export async function setMcpPolicy(tenantId: string, requireReview: boolean) {
  await db
    .insert(workspaceMcpPolicy)
    .values({ tenantId, requireReview })
    .onConflictDoUpdate({
      target: workspaceMcpPolicy.tenantId,
      set: { requireReview, updatedAt: new Date() },
    });
  return { requireReview };
}

export async function listConnections(tenantId: string, userId: string) {
  return db
    .select({
      id: oauthGrantTenant.id,
      clientId: oauthGrantTenant.oauthClientId,
      clientName: oauthClient.name,
      scopes: oauthGrantTenant.scopes,
      createdAt: oauthGrantTenant.createdAt,
      revokedAt: oauthGrantTenant.revokedAt,
    })
    .from(oauthGrantTenant)
    .leftJoin(
      oauthClient,
      eq(oauthClient.clientId, oauthGrantTenant.oauthClientId),
    )
    .where(
      and(
        eq(oauthGrantTenant.organizationId, tenantId),
        eq(oauthGrantTenant.userId, userId),
      ),
    )
    .orderBy(desc(oauthGrantTenant.createdAt));
}
