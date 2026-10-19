import { createHash, randomUUID } from "node:crypto";
import { and, count, desc, eq, gt } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../db/client.js";
import { noteProposals, noteRevisions, notes } from "../db/schema.js";
import {
  type productCommands,
  ProductError,
} from "../domain/product-inputs.js";
import {
  NoteNotFoundError,
  NoteVersionConflictError,
} from "../domain/errors.js";
import { updateNoteInTransaction } from "./note-repository.js";

const PROPOSAL_LIFETIME_MS = 30 * 86400_000;
const expiresAt = (createdAt: Date) =>
  new Date(createdAt.getTime() + PROPOSAL_LIFETIME_MS);

const proposalKey = (tenantId: string, id: string) =>
  and(eq(noteProposals.tenantId, tenantId), eq(noteProposals.id, id));

export async function proposeUpdate(
  tenantId: string,
  userId: string,
  input: z.infer<(typeof productCommands)["note.proposeUpdate"]>,
  oauthClientId?: string,
) {
  return db.transaction(async (tx) => {
    const [note] = await tx
      .select()
      .from(notes)
      .where(and(eq(notes.tenantId, tenantId), eq(notes.id, input.id)))
      .for("update");
    if (!note) throw new NoteNotFoundError();
    // The note lock serializes retries and enforces the pending limit.
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify([
          input.expectedVersion,
          input.title,
          input.body,
          input.summary === undefined ? { omitted: true } : input.summary,
          input.reason,
          input.source,
        ]),
      )
      .digest("hex");
    const requestKey = createHash("sha256")
      .update(
        JSON.stringify([
          userId,
          oauthClientId ?? null,
          input.idempotencyKey
            ? ["key", input.idempotencyKey]
            : ["payload", requestHash],
        ]),
      )
      .digest("hex");
    const [existing] = await tx
      .select()
      .from(noteProposals)
      .where(
        and(
          eq(noteProposals.tenantId, tenantId),
          eq(noteProposals.noteId, note.id),
          eq(noteProposals.requestKey, requestKey),
        ),
      );
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw new ProductError(
          "idempotency_conflict",
          "This idempotency key was used for different content",
          409,
        );
      return existing;
    }
    if (note.version !== input.expectedVersion)
      throw new NoteVersionConflictError(note.version);
    if (note.archivedAt || note.trashedAt)
      throw new ProductError(
        "inactive_note",
        "Restore this note before proposing changes",
        409,
      );
    const [pending] = await tx
      .select({ count: count() })
      .from(noteProposals)
      .where(
        and(
          eq(noteProposals.tenantId, tenantId),
          eq(noteProposals.noteId, note.id),
          eq(noteProposals.status, "pending"),
          gt(
            noteProposals.createdAt,
            new Date(Date.now() - PROPOSAL_LIFETIME_MS),
          ),
        ),
      );
    if (!pending) throw new Error("Pending proposal count is missing");
    if (pending.count >= 20)
      throw new ProductError(
        "proposal_limit",
        "Review pending proposals before submitting more (limit 20 per note)",
        409,
      );
    // Preserve the exact baseline even for notes created before revision history.
    await tx
      .insert(noteRevisions)
      .values({
        id: randomUUID(),
        tenantId,
        noteId: note.id,
        version: note.version,
        title: note.title,
        body: note.body,
        summary: note.summary,
        createdAt: note.updatedAt,
      })
      .onConflictDoNothing();
    const [proposal] = await tx
      .insert(noteProposals)
      .values({
        id: randomUUID(),
        tenantId,
        noteId: note.id,
        expectedVersion: input.expectedVersion,
        title: input.title,
        body: input.body,
        summary: input.summary === undefined ? note.summary : input.summary,
        requestKey,
        requestHash,
        reason: input.reason,
        source: input.source,
        proposedByUserId: userId,
        oauthClientId: oauthClientId ?? null,
      })
      .returning();
    return proposal;
  });
}

export async function listProposals(
  tenantId: string,
  noteId: string,
  offset = 0,
) {
  const [note] = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.tenantId, tenantId), eq(notes.id, noteId)));
  if (!note) throw new NoteNotFoundError();
  const rows = await db
    .select({
      id: noteProposals.id,
      noteId: noteProposals.noteId,
      expectedVersion: noteProposals.expectedVersion,
      title: noteProposals.title,
      reason: noteProposals.reason,
      source: noteProposals.source,
      proposedByUserId: noteProposals.proposedByUserId,
      oauthClientId: noteProposals.oauthClientId,
      status: noteProposals.status,
      createdAt: noteProposals.createdAt,
      reviewedByUserId: noteProposals.reviewedByUserId,
      reviewedAt: noteProposals.reviewedAt,
      appliedVersion: noteProposals.appliedVersion,
    })
    .from(noteProposals)
    .where(
      and(
        eq(noteProposals.tenantId, tenantId),
        eq(noteProposals.noteId, noteId),
      ),
    )
    .orderBy(desc(noteProposals.createdAt), noteProposals.id)
    .limit(21)
    .offset(offset);
  return { proposals: rows.slice(0, 20), hasMore: rows.length > 20 };
}

export async function getProposal(tenantId: string, id: string) {
  const [proposal] = await db
    .select()
    .from(noteProposals)
    .where(proposalKey(tenantId, id));
  if (!proposal) throw new ProductError("not_found", "Proposal not found", 404);
  const [base] = await db
    .select({
      title: noteRevisions.title,
      body: noteRevisions.body,
      summary: noteRevisions.summary,
    })
    .from(noteRevisions)
    .where(
      and(
        eq(noteRevisions.tenantId, tenantId),
        eq(noteRevisions.noteId, proposal.noteId),
        eq(noteRevisions.version, proposal.expectedVersion),
      ),
    );
  if (!base) throw new Error("Proposal baseline is missing");
  return {
    ...proposal,
    base,
    expiresAt: expiresAt(proposal.createdAt),
    expired: expiresAt(proposal.createdAt).getTime() <= Date.now(),
  };
}

export async function reviewProposal(
  tenantId: string,
  userId: string,
  id: string,
  accept: boolean,
) {
  return db.transaction(async (tx) => {
    const [proposal] = await tx
      .select()
      .from(noteProposals)
      .where(proposalKey(tenantId, id))
      .for("update");
    if (!proposal)
      throw new ProductError("not_found", "Proposal not found", 404);
    if (proposal.status !== "pending")
      throw new ProductError(
        "proposal_reviewed",
        "This proposal has already been reviewed",
        409,
      );
    let appliedVersion: number | null = null;
    if (accept) {
      if (expiresAt(proposal.createdAt).getTime() <= Date.now())
        throw new ProductError(
          "proposal_expired",
          "This proposal expired. Submit a fresh proposal after reading the note again.",
          409,
        );
      const [note] = await tx
        .select()
        .from(notes)
        .where(and(eq(notes.tenantId, tenantId), eq(notes.id, proposal.noteId)))
        .for("update");
      if (!note) throw new NoteNotFoundError();
      if (note.archivedAt || note.trashedAt)
        throw new ProductError(
          "inactive_note",
          "Restore this note before accepting changes",
          409,
        );
      const updated = await updateNoteInTransaction(tx, {
        tenantId,
        noteId: proposal.noteId,
        expectedVersion: proposal.expectedVersion,
        title: proposal.title,
        body: proposal.body,
        summary: proposal.summary,
        authorUserId: userId,
      });
      if (!updated) throw new NoteVersionConflictError(note.version);
      appliedVersion = updated.version;
    }
    const [reviewed] = await tx
      .update(noteProposals)
      .set({
        status: accept ? "accepted" : "rejected",
        reviewedByUserId: userId,
        reviewedAt: new Date(),
        appliedVersion,
      })
      .where(proposalKey(tenantId, id))
      .returning();
    return reviewed;
  });
}
