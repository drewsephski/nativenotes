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

/** Linear-time replacement diff: unchanged edges collapse; changed lines stay visible. */
export function ContentDiff({
  before,
  after,
  label,
}: {
  before: string;
  after: string;
  label: string;
}) {
  const oldLines = before.split("\n");
  const newLines = after.split("\n");
  let start = 0;
  while (
    start < oldLines.length &&
    start < newLines.length &&
    oldLines[start] === newLines[start]
  )
    start++;
  let end = 0;
  while (
    end < oldLines.length - start &&
    end < newLines.length - start &&
    oldLines[oldLines.length - 1 - end] === newLines[newLines.length - 1 - end]
  )
    end++;
  return (
    <section aria-label={`${label} diff`} className="min-w-0">
      <h3 className="mb-2 font-medium">{label}</h3>
      {before === after ? (
        <p className="text-sm text-muted-foreground">Unchanged</p>
      ) : (
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded border border-border p-3 font-mono text-xs leading-6">
          {start > 0 && (
            <span className="block text-muted-foreground">
              … {start} unchanged lines
            </span>
          )}
          {oldLines.slice(start, oldLines.length - end).map((line, i) => (
            <span key={`old:${i}`} className="block bg-red-50 text-red-900">
              − {line}
            </span>
          ))}
          {newLines.slice(start, newLines.length - end).map((line, i) => (
            <span key={`new:${i}`} className="block bg-green-50 text-green-900">
              + {line}
            </span>
          ))}
          {end > 0 && (
            <span className="block text-muted-foreground">
              … {end} unchanged lines
            </span>
          )}
        </pre>
      )}
    </section>
  );
}

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
            {data.status}
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
      {data.status === "pending" && (
        <>
          {(stale || hasDraft || note.archivedAt || note.trashedAt) && (
            <p className="text-sm text-muted-foreground">
              {stale
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
              No proposals yet. An agent with write access can use
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
