import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";

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
