"use client";

import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/app-shell/empty-state";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/mock-data";
import type { NoteListItem } from "@/lib/notes-api";
import { cn } from "@/lib/utils";

interface NoteEditorProps {
  note: NoteListItem | null;
  onBack?: () => void;
  className?: string;
  /** This task is read-only; editing is always disabled. */
  readOnly?: boolean;
}

function NoteEditorView({
  note,
  onBack,
}: {
  note: NoteListItem;
  onBack?: () => void;
}) {
  return (
    <>
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        {onBack ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            aria-label="Back to notes list"
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] text-muted-foreground">
            Read-only preview
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-5 sm:px-8">
          <h2
            id={`note-title-${note.id}`}
            className="w-full text-[22px] font-semibold tracking-tight text-foreground"
          >
            {note.title || "Untitled"}
          </h2>
          <time
            dateTime={note.updatedAt}
            className="font-mono text-[11px] text-muted-foreground"
          >
            Updated {formatRelativeTime(note.updatedAt)}
          </time>
          <pre
            id={`note-body-${note.id}`}
            className="min-h-[420px] w-full whitespace-pre-wrap break-words font-mono text-[13px] leading-6 text-foreground/90"
            aria-label="Note content"
          >
            {note.body}
          </pre>
        </div>
      </div>
    </>
  );
}

export function NoteEditor({ note, onBack, className }: NoteEditorProps) {
  if (!note) {
    return (
      <div className={cn("flex h-full flex-col bg-panel", className)}>
        <EmptyState
          title="Select a note"
          description="Choose a note from the list to preview it here."
        />
      </div>
    );
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-panel", className)}>
      <NoteEditorView key={note.id} note={note} onBack={onBack} />
    </div>
  );
}
