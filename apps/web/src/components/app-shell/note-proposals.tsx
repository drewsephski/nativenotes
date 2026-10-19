"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  productRequest,
  type NoteProposal,
  type ProductNote,
  type ProposalMetadata,
} from "@/lib/product-api";
import { useAction, useProduct, useResource } from "./product-context";

import { ContentDiff } from "./content-diff";

function ProposalReview({
  id,
  note,
  hasDraft,
  onApplied,
}: {
  id: string;
  note: ProductNote;
  hasDraft: boolean;
  onApplied: (note: ProductNote) => void;
}) {
  const { data, error } = useResource<NoteProposal>(
    `proposal?id=${encodeURIComponent(id)}`,
  );
  const { mutate, workspaceId } = useProduct();
  const action = useAction();
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p role="status">Loading proposal…</p>;
  const expired = data.expired === true;
  const stale = data.expectedVersion !== note.version;
  async function review(accept: boolean) {
    await mutate(accept ? "proposal.accept" : "proposal.reject", { id });
    if (accept) {
      const latest = await productRequest<ProductNote>(
        workspaceId,
        `note?id=${encodeURIComponent(note.id)}`,
      );
      onApplied(latest);
    }
  }
  return (
    <div className="min-w-0 space-y-4">
      <p className="text-sm">{data.reason}</p>
      <dl className="space-y-2 break-words text-xs text-muted-foreground">
        <div>
          <dt className="font-medium">Source (submitted by proposer)</dt>
          <dd className="whitespace-pre-wrap">{data.source}</dd>
        </div>
        <div>
          <dt className="font-medium">OAuth client</dt>
          <dd>
            {data.oauthClientId ?? "Not recorded (web session or older client)"}
          </dd>
        </div>
        <div>
          <dt className="font-medium">Proposed by</dt>
          <dd>{data.proposedByUserId}</dd>
        </div>
        <div>
          <dt className="font-medium">Review status</dt>
          <dd>
            {data.status === "pending" && expired ? "expired" : data.status}
            {data.appliedVersion
              ? ` · saved as version ${data.appliedVersion}`
              : ""}
          </dd>
        </div>
        {data.reviewedByUserId && (
          <div>
            <dt className="font-medium">Reviewed by</dt>
            <dd>{data.reviewedByUserId}</dd>
          </div>
        )}
      </dl>
      <p className="text-xs text-muted-foreground">
        Compared with version {data.expectedVersion}. Current note: version{" "}
        {note.version}.
      </p>
      <ContentDiff label="Title" before={data.base.title} after={data.title} />
      <ContentDiff
        label="Summary"
        before={data.base.summary ?? ""}
        after={data.summary ?? ""}
      />
      <ContentDiff label="Content" before={data.base.body} after={data.body} />
      {action.error && (
        <p role="alert" className="text-sm text-destructive">
          {action.error}
        </p>
      )}
      {data.status === "pending" && data.canReview !== true && (
        <p className="text-sm text-muted-foreground">
          A workspace owner or admin must review this proposal.
        </p>
      )}
      {data.status === "pending" && data.canReview === true && (
        <>
          {(expired ||
            stale ||
            hasDraft ||
            note.archivedAt ||
            note.trashedAt) && (
            <p className="text-sm text-muted-foreground">
              {expired
                ? "This proposal expired. Ask the agent to submit a fresh proposal."
                : stale
                  ? "The note changed after this proposal. Ask the agent to read it again and submit a new proposal."
                  : hasDraft
                    ? "Save or cancel your draft before accepting a proposal."
                    : "Restore the note before accepting a proposal."}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={
                action.busy ||
                expired ||
                stale ||
                hasDraft ||
                Boolean(note.archivedAt || note.trashedAt)
              }
              onClick={() => void action.run(() => review(true))}
            >
              Accept and save
            </Button>
            <Button
              variant="outline"
              disabled={action.busy}
              onClick={() => void action.run(() => review(false))}
            >
              Reject proposal
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export function NoteProposals({
  note,
  hasDraft,
  onClose,
  onApplied,
}: {
  note: ProductNote;
  hasDraft: boolean;
  onClose: () => void;
  onApplied: (note: ProductNote) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const { data, error } = useResource<{
    proposals: ProposalMetadata[];
    hasMore: boolean;
  }>(`proposals?noteId=${encodeURIComponent(note.id)}&offset=${offset}`);
  return (
    <Dialog
      title="Agent changes"
      description="Review proposed edits before saving. Each accepted change creates a new revision."
      onClose={onClose}
      className="w-[min(94vw,900px)]"
    >
      {error && <p role="alert">{error}</p>}
      <div className="grid min-w-0 gap-6 sm:grid-cols-[200px_minmax(0,1fr)]">
        <div className="space-y-3">
          {!data && !error && <p role="status">Loading proposals…</p>}
          {data?.proposals.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No proposals yet. An agent with proposal access can use
              note.proposeUpdate.
            </p>
          )}
          <ul className="space-y-2">
            {data?.proposals.map((p) => (
              <li key={p.id}>
                <Button
                  variant="ghost"
                  className="h-auto w-full justify-start whitespace-normal p-2 text-left"
                  aria-pressed={selected === p.id}
                  onClick={() => setSelected(p.id)}
                >
                  <span className="min-w-0 break-words">
                    {p.title}
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {p.status} · version {p.expectedVersion}
                    </span>
                  </span>
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            {offset > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOffset(offset - 20)}
              >
                Previous
              </Button>
            )}
            {data?.hasMore && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOffset(offset + 20)}
              >
                Next
              </Button>
            )}
          </div>
        </div>
        {selected ? (
          <ProposalReview
            key={selected}
            id={selected}
            note={note}
            hasDraft={hasDraft}
            onApplied={onApplied}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Choose a proposal to inspect its source and diff.
          </p>
        )}
      </div>
    </Dialog>
  );
}
