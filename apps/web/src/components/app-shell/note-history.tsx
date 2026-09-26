"use client";
import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/date";
import type { ProductNote, Revision } from "@/lib/product-api";
import { useAction, useProduct, useResource } from "./product-context";
import { MarkdownBody } from "./markdown";
export function NoteHistory({
  note,
  onClose,
  onRestore,
  hasDraft,
}: {
  note: ProductNote;
  onClose: () => void;
  onRestore: (note: ProductNote) => void;
  hasDraft: boolean;
}) {
  const { data, error } = useResource<{ revisions: Revision[] }>(
    `history?id=${note.id}`,
  );
  const [selected, setSelected] = useState<Revision | null>(null);
  const { mutate } = useProduct();
  const action = useAction();
  return (
    <Dialog
      title="Note history"
      onClose={onClose}
      className="w-[min(94vw,800px)]"
      description="Every content save is a snapshot. Restoring creates a new version."
    >
      {(error || action.error) && (
        <p role="alert" className="text-destructive">
          {error || action.error}
        </p>
      )}
      <div className="grid gap-6 sm:grid-cols-[180px_1fr]">
        <ul className="space-y-1">
          {data?.revisions.map((r) => (
            <li key={r.id}>
              <Button
                type="button"
                variant="ghost"
                className={`h-auto w-full justify-start rounded p-2 text-left ${selected?.id === r.id ? "bg-accent" : ""}`}
                onClick={() => setSelected(r)}
              >
                <span className="font-medium">Version {r.version}</span>
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  {formatRelativeTime(r.createdAt)}
                </span>
              </Button>
            </li>
          ))}
        </ul>
        <div className="min-w-0">
          {selected ? (
            <>
              <h3 className="mb-2 text-xl font-semibold">{selected.title}</h3>
              {selected.summary && (
                <p className="mb-4 border-l-2 border-border pl-3 text-muted-foreground">
                  {selected.summary}
                </p>
              )}
              <MarkdownBody body={selected.body} />
              <Button
                className="mt-6"
                disabled={action.busy || hasDraft}
                onClick={() =>
                  void action.run(async () => {
                    const restored = await mutate<ProductNote>(
                      "note.restoreRevision",
                      {
                        id: note.id,
                        revisionId: selected.id,
                        expectedVersion: note.version,
                      },
                    );
                    onRestore(restored);
                    onClose();
                  })
                }
              >
                Restore version {selected.version}
              </Button>
              {hasDraft && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Save or cancel your draft before restoring.
                </p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">
              {data?.revisions.length === 0
                ? "History begins with the next content edit of this existing note."
                : "Choose a version to inspect its content."}
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
