import { setTransactionTimeouts } from "../db/timeouts.js";
import {
  oauthRefreshToken,
  oauthAccessToken,
  oauthConsent,
} from "../db/auth-schema.js";
import { createHash } from "node:crypto";

import { and, eq, isNotNull, sql } from "drizzle-orm";

import { db } from "../db/client.js";
import { oauthGrantTenant, type OAuthGrantTenant } from "../db/schema.js";
import { ForbiddenError } from "../domain/errors.js";

export type GrantBindingInput = {
  userId: string;
  oauthClientId: string;
  organizationId: string;
  resource: string;
  scopes: string[];
};

function normalizeScopes(scopes: string[]): string[] {
  return [...new Set(scopes)].sort();
}

export function stableGrantIdentifier(input: GrantBindingInput): string {
  const canonical = [
    input.userId,
    input.oauthClientId,
    input.organizationId,
    input.resource,
    normalizeScopes(input.scopes).join(" "),
  ].join("\u001f");

  return createHash("sha256").update(canonical).digest("hex");
}

export async function ensureGrantBinding(
  input: GrantBindingInput,
  reauthorize = false,
): Promise<OAuthGrantTenant> {
  const normalizedScopes = normalizeScopes(input.scopes);
  const stableIdentifier = stableGrantIdentifier(input);

  await db
    .insert(oauthGrantTenant)
    .values({
      id: stableIdentifier,
      userId: input.userId,
      oauthClientId: input.oauthClientId,
      organizationId: input.organizationId,
      resource: input.resource,
      scopes: normalizedScopes,
      stableGrantIdentifier: stableIdentifier,
    })
    .onConflictDoNothing({ target: oauthGrantTenant.stableGrantIdentifier });

  // Only a fresh authorization-code exchange can restore a revoked grant.
  // Version stays advanced, so old JWTs never become valid again.
  if (reauthorize)
    await db
      .update(oauthGrantTenant)
      .set({ revokedAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(oauthGrantTenant.id, stableIdentifier),
          isNotNull(oauthGrantTenant.revokedAt),
        ),
      );

  const binding = await db.query.oauthGrantTenant.findFirst({
    where: and(eq(oauthGrantTenant.stableGrantIdentifier, stableIdentifier)),
  });

  if (
    !binding ||
    binding.revokedAt ||
    binding.organizationId !== input.organizationId ||
    binding.userId !== input.userId ||
    binding.oauthClientId !== input.oauthClientId
  ) {
    throw new ForbiddenError("OAuth grant tenant binding is unavailable");
  }

  return binding;
}

export async function requireActiveGrant(
  input: GrantBindingInput,
  tokenVersion: unknown,
) {
  const binding = await db.query.oauthGrantTenant.findFirst({
    where: eq(oauthGrantTenant.id, stableGrantIdentifier(input)),
  });
  // Legacy JWTs remain valid only for bindings never revoked.
  const version = tokenVersion === undefined ? 0 : tokenVersion;
  if (!binding || binding.revokedAt || binding.tokenVersion !== version)
    throw new ForbiddenError(
      "This connection was revoked. Reconnect the client to continue.",
    );
}

export async function revokeClientGrants(
  tenantId: string,
  userId: string,
  clientId: string,
) {
  // Revoke every scope variant; a previous broader grant must not survive.
  return db.transaction(async (tx) => {
    await setTransactionTimeouts(tx);
    const result = await tx
      .update(oauthGrantTenant)
      .set({
        revokedAt: new Date(),
        updatedAt: new Date(),
        tokenVersion: sql`${oauthGrantTenant.tokenVersion} + 1`,
      })
      .where(
        and(
          eq(oauthGrantTenant.organizationId, tenantId),
          eq(oauthGrantTenant.userId, userId),
          eq(oauthGrantTenant.oauthClientId, clientId),
        ),
      )
      .returning({ id: oauthGrantTenant.id });
    for (const table of [oauthRefreshToken, oauthAccessToken]) {
      await tx
        .update(table)
        .set({ revoked: new Date() })
        .where(
          and(
            eq(table.userId, userId),
            eq(table.clientId, clientId),
            eq(table.referenceId, tenantId),
          ),
        );
    }
    await tx
      .delete(oauthConsent)
      .where(
        and(
          eq(oauthConsent.userId, userId),
          eq(oauthConsent.clientId, clientId),
          eq(oauthConsent.referenceId, tenantId),
        ),
      );
    return result;
  });
}
