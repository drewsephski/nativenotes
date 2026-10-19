import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray, sql as querySql } from "drizzle-orm";
import { db, sql } from "../src/db/client.js";
import {
  notes,
  noteRevisions,
  noteCreateRequests,
  oauthGrantTenant,
  workspaceMcpPolicy,
  requestBudgets,
} from "../src/db/schema.js";
import { executeProductCommand } from "../src/services/product-service.js";
import { setMcpPolicy } from "../src/repositories/connection-repository.js";
import {
  ensureGrantBinding,
  requireActiveGrant,
  revokeClientGrants,
} from "../src/repositories/oauth-grant-tenant-repository.js";
import { consumeRequestBudget } from "../src/services/request-budget.js";
import { createHash } from "node:crypto";
import { setTransactionTimeouts } from "../src/db/timeouts.js";
import { productError } from "../src/domain/product-errors.js";
const tenant = `readiness-${randomUUID()}`;
const other = `${tenant}-other`;
const actor = { kind: "mcp" as const, oauthClientId: "readiness-client" };
const binding = {
  userId: tenant,
  oauthClientId: actor.oauthClientId,
  organizationId: tenant,
  resource: "https://example.test/mcp",
  scopes: ["mcp:read", "mcp:write"],
};
const budgetKey = `test:${tenant}`;
afterAll(async () => {
  await db.delete(notes).where(inArray(notes.tenantId, [tenant, other]));
  await db
    .delete(noteCreateRequests)
    .where(inArray(noteCreateRequests.tenantId, [tenant, other]));
  await db.delete(oauthGrantTenant).where(eq(oauthGrantTenant.userId, tenant));
  await db
    .delete(workspaceMcpPolicy)
    .where(eq(workspaceMcpPolicy.tenantId, tenant));
  await db
    .delete(requestBudgets)
    .where(
      eq(
        requestBudgets.key,
        createHash("sha256").update(budgetKey).digest("hex"),
      ),
    );
});
describe("MCP production safeguards", { timeout: 30_000 }, () => {
  it("commits exactly one note and revision across concurrent retries, and rejects changed payloads", async () => {
    const input = { title: "Retry", body: "One", idempotencyKey: randomUUID() };
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        executeProductCommand(tenant, tenant, "note.create", input, actor),
      ),
    );
    const ids = results.map((result) => (result as { id: string }).id);
    expect(new Set(ids).size).toBe(1);
    expect(
      await db
        .select()
        .from(noteRevisions)
        .where(eq(noteRevisions.noteId, ids[0]!)),
    ).toHaveLength(1);
    await expect(
      executeProductCommand(
        tenant,
        tenant,
        "note.create",
        { ...input, body: "Changed" },
        actor,
      ),
    ).rejects.toMatchObject({ code: "idempotency_conflict" });
    const foreign = (await executeProductCommand(
      other,
      tenant,
      "note.create",
      input,
      actor,
    )) as { id: string };
    expect(foreign.id).not.toBe(ids[0]);
    await db.delete(notes).where(eq(notes.id, ids[0]!));
    await expect(
      executeProductCommand(tenant, tenant, "note.create", input, actor),
    ).rejects.toThrow("Note not found");
  });
  it("blocks old and legacy JWTs immediately after revocation, including after reconnect", async () => {
    const grant = await ensureGrantBinding(binding);
    await expect(
      requireActiveGrant(binding, undefined),
    ).resolves.toBeUndefined();
    await revokeClientGrants(tenant, tenant, actor.oauthClientId);
    await expect(
      requireActiveGrant(binding, grant.tokenVersion),
    ).rejects.toMatchObject({ status: 403 });
    await expect(ensureGrantBinding(binding)).rejects.toMatchObject({
      status: 403,
    });
    const fresh = await ensureGrantBinding(binding, true);
    await expect(requireActiveGrant(binding, undefined)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      requireActiveGrant(binding, grant.tokenVersion),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      requireActiveGrant(binding, fresh.tokenVersion),
    ).resolves.toBeUndefined();
    await revokeClientGrants(other, tenant, actor.oauthClientId);
    await expect(
      requireActiveGrant(binding, fresh.tokenVersion),
    ).resolves.toBeUndefined();
  });
  it("enforces current workspace review policy at dispatch, without blocking web capture", async () => {
    await setMcpPolicy(tenant, true);
    await expect(
      executeProductCommand(
        tenant,
        tenant,
        "note.create",
        { title: "Denied", body: "" },
        actor,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      executeProductCommand(tenant, tenant, "note.create", {
        title: "Web",
        body: "",
      }),
    ).resolves.toMatchObject({ title: "Web" });
    await setMcpPolicy(tenant, false);
  });
  it("enforces statement and lock timeouts inside pooled transactions", async () => {
    await db.transaction(async (tx) => {
      await setTransactionTimeouts(tx);
      const settings = await tx.execute<{
        statement_timeout: string;
        lock_timeout: string;
      }>(
        querySql`select current_setting('statement_timeout') as statement_timeout, current_setting('lock_timeout') as lock_timeout`,
      );
      expect(settings[0]).toMatchObject({
        statement_timeout: "10s",
        lock_timeout: "3s",
      });
    });
    expect(productError({ code: "57014" })).toMatchObject({
      status: 503,
      error: "temporarily_unavailable",
    });
  });
  it("counts concurrent budgets across connections and resets elapsed windows", async () => {
    const result = await Promise.all(
      Array.from({ length: 5 }, () => consumeRequestBudget(budgetKey, 3)),
    );
    expect(result.filter((r) => r.allowed)).toHaveLength(3);
    expect(result.every((r) => r.retryAfter > 0 && r.retryAfter <= 60)).toBe(
      true,
    );
    const key = createHash("sha256").update(budgetKey).digest("hex");
    await sql`update request_budgets set window_start = now() - interval '2 minutes' where key = ${key}`;
    expect((await consumeRequestBudget(budgetKey, 3)).allowed).toBe(true);
  });
});
