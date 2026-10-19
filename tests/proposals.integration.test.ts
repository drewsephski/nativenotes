import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { notes, type noteProposals, noteRevisions } from "../src/db/schema.js";
import { noteRepository } from "../src/repositories/note-repository.js";
import {
  getNote,
  history,
  queryNoteMetadata,
  setNoteMetadata,
} from "../src/repositories/knowledge-repository.js";
import {
  getProposal,
  listProposals,
  reviewProposal,
} from "../src/repositories/proposal-repository.js";
import { executeProductCommand } from "../src/services/product-service.js";
import { noteFilter } from "../src/domain/product-inputs.js";

const tenant = `proposals-${randomUUID()}`;
const actor = {
  kind: "mcp" as const,
  oauthClientId: "https://agent.example/client.json",
};
async function fixture() {
  const note = await noteRepository.create({
    id: randomUUID(),
    tenantId: tenant,
    title: "Project memory",
    body: "original",
    summary: "Keep summary",
    authorUserId: "owner",
  });
  const proposal = await executeProductCommand(
    tenant,
    "agent-user",
    "note.proposeUpdate",
    {
      id: note.id,
      expectedVersion: 1,
      title: "Updated project memory",
      body: "verified decision",
      reason: "Record architecture decision",
      source: "repo/commit/abc123",
      tenantId: "forged",
      proposedByUserId: "forged",
      oauthClientId: "forged",
    },
    actor,
  );
  return { note, proposal: proposal as typeof noteProposals.$inferSelect };
}
afterAll(async () => {
  await db.delete(notes).where(eq(notes.tenantId, tenant));
});
describe("agent proposal loop", { timeout: 30_000 }, () => {
  it("captures, searches compact metadata, proposes, reviews, saves and retrieves from another client", async () => {
    const { note, proposal } = await fixture();
    const results = await queryNoteMetadata(
      tenant,
      noteFilter.parse({ query: "Project memory", limit: 1 }),
    );
    expect(results.notes.some((n) => n.id === note.id)).toBe(true);
    expect(results.notes[0]).not.toHaveProperty("body");
    expect(await getNote(tenant, note.id)).toMatchObject({
      body: "original",
      version: 1,
    });
    expect(await getProposal(tenant, proposal.id)).toMatchObject({
      proposedByUserId: "agent-user",
      oauthClientId: actor.oauthClientId,
      status: "pending",
      base: { body: "original", summary: "Keep summary" },
      summary: "Keep summary",
    });
    expect(
      (await listProposals(tenant, note.id)).proposals[0],
    ).not.toHaveProperty("body");
    const accepted = await reviewProposal(
      tenant,
      "reviewer",
      proposal.id,
      true,
    );
    expect(accepted).toMatchObject({
      status: "accepted",
      appliedVersion: 2,
      reviewedByUserId: "reviewer",
    });
    // A separate client's next read sees committed content and its exact revision.
    expect(await getNote(tenant, note.id)).toMatchObject({
      body: "verified decision",
      version: 2,
      summary: "Keep summary",
    });
    expect(await history(tenant, note.id)).toMatchObject([
      { version: 2, authorUserId: "reviewer" },
      { version: 1, body: "original" },
    ]);
    await expect(
      reviewProposal(tenant, "reviewer", proposal.id, true),
    ).rejects.toMatchObject({ code: "proposal_reviewed" });
  });
  it("isolates proposal lookup, listing, creation and review across tenants", async () => {
    const { note, proposal } = await fixture();
    await expect(getProposal("foreign", proposal.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(listProposals("foreign", note.id)).rejects.toThrow();
    await expect(
      reviewProposal("foreign", "intruder", proposal.id, true),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      executeProductCommand(
        "foreign",
        "intruder",
        "note.proposeUpdate",
        {
          id: note.id,
          expectedVersion: 1,
          title: "Bad",
          body: "Bad",
          reason: "Bad",
          source: "Bad",
        },
        actor,
      ),
    ).rejects.toThrow();
    expect(await getNote(tenant, note.id)).toMatchObject({
      body: "original",
      version: 1,
    });
  });
  it("rejects stale proposals without content or status changes, and permits rejection", async () => {
    const { note, proposal } = await fixture();
    await noteRepository.update({
      tenantId: tenant,
      noteId: note.id,
      expectedVersion: 1,
      title: note.title,
      body: "human changed",
    });
    await expect(
      reviewProposal(tenant, "reviewer", proposal.id, true),
    ).rejects.toMatchObject({ currentVersion: 2 });
    expect(await getProposal(tenant, proposal.id)).toMatchObject({
      status: "pending",
      base: { body: "original" },
    });
    expect(await getNote(tenant, note.id)).toMatchObject({
      body: "human changed",
      version: 2,
    });
    expect(
      await reviewProposal(tenant, "reviewer", proposal.id, false),
    ).toMatchObject({ status: "rejected", appliedVersion: null });
  });
  it("allows only one of concurrent accept/reject requests to commit", async () => {
    const { note, proposal } = await fixture();
    const results = await Promise.allSettled([
      reviewProposal(tenant, "a", proposal.id, true),
      reviewProposal(tenant, "b", proposal.id, false),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const saved = await getProposal(tenant, proposal.id);
    expect((await history(tenant, note.id)).length).toBe(
      saved.status === "accepted" ? 2 : 1,
    );
  });
  it("rolls back acceptance when revision insertion fails", async () => {
    const { note, proposal } = await fixture();
    const blocker = randomUUID();
    await db.insert(noteRevisions).values({
      id: blocker,
      tenantId: tenant,
      noteId: note.id,
      version: 2,
      title: "Collision",
      body: "",
    });
    await expect(
      reviewProposal(tenant, "reviewer", proposal.id, true),
    ).rejects.toThrow();
    expect(await getNote(tenant, note.id)).toMatchObject({
      body: "original",
      version: 1,
    });
    expect(await getProposal(tenant, proposal.id)).toMatchObject({
      status: "pending",
      appliedVersion: null,
    });
    await db.delete(noteRevisions).where(eq(noteRevisions.id, blocker));
  });
  it("blocks MCP review and acceptance of inactive notes", async () => {
    const { note, proposal } = await fixture();
    for (const command of ["proposal.accept", "proposal.reject"] as const)
      await expect(
        executeProductCommand(
          tenant,
          "agent",
          command,
          { id: proposal.id },
          actor,
        ),
      ).rejects.toMatchObject({ status: 403 });
    await setNoteMetadata(tenant, note.id, { archivedAt: new Date() });
    await expect(
      reviewProposal(tenant, "reviewer", proposal.id, true),
    ).rejects.toMatchObject({ code: "inactive_note" });
    expect(await getProposal(tenant, proposal.id)).toMatchObject({
      status: "pending",
    });
  });
});
