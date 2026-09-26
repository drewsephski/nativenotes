"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/app-shell/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatRelativeTime } from "@/lib/date";
import {
  NotesApiError,
  updateNote,
  type Note,
  type NoteListItem,
} from "@/lib/notes-api";
import { cn } from "@/lib/utils";

type SaveStatus =
  | "saved"
  | "unsaved"
  | "saving"
  | "conflict"
  | "error";

interface NoteEditorProps {
  note: NoteListItem | null;
  onBack?: () => void;
  /** Called after a successful save so the parent list can update. */
  onNoteSaved?: (note: Note) => void;
  /**
   * Conflict "Reload latest": refetch notes and return the latest copy of
   * this note (or null if gone). Parent owns list state.
   */
  onReloadLatest?: (noteId: string) => Promise<NoteListItem | null>;
  className?: string;
}

function statusLabel(status: SaveStatus): string {
  switch (status) {
    case "saved":
      return "Saved";
    case "unsaved":
      return "Unsaved changes";
    case "saving":
      return "Saving…";
    case "conflict":
      return "Conflict";
    case "error":
      return "Could not save";
  }
}

function NoteEditorView({
  note,
  onBack,
  onNoteSaved,
  onReloadLatest,
}: {
  note: NoteListItem;
  onBack?: () => void;
  onNoteSaved?: (note: Note) => void;
  onReloadLatest?: (noteId: string) => Promise<NoteListItem | null>;
}) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [version, setVersion] = useState(note.version);
  const [updatedAt, setUpdatedAt] = useState(note.updatedAt);
  const [baselineTitle, setBaselineTitle] = useState(note.title);
  const [baselineBody, setBaselineBody] = useState(note.body);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Switching notes discards the local draft and resets to the selected note.
  useEffect(() => {
    setTitle(note.title);
    setBody(note.body);
    setVersion(note.version);
    setUpdatedAt(note.updatedAt);
    setBaselineTitle(note.title);
    setBaselineBody(note.body);
    setStatus("saved");
    setErrorMessage(null);
  }, [note.id]);

  const isDirty = title !== baselineTitle || body !== baselineBody;
  const displayStatus: SaveStatus =
    status === "saving" || status === "conflict" || status === "error"
      ? status
      : isDirty
        ? "unsaved"
        : "saved";

  function handleTitleChange(value: string) {
    setTitle(value);
    if (status === "conflict" || status === "error") {
      setStatus("unsaved");
      setErrorMessage(null);
    }
  }

  function handleBodyChange(value: string) {
    setBody(value);
    if (status === "conflict" || status === "error") {
      setStatus("unsaved");
      setErrorMessage(null);
    }
  }

  async function handleSave() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setStatus("error");
      setErrorMessage("Title is required");
      return;
    }

    setStatus("saving");
    setErrorMessage(null);

    try {
      const saved = await updateNote({
        id: note.id,
        title: trimmedTitle,
        body,
        expectedVersion: version,
      });
      setTitle(saved.title);
      setBody(saved.body);
      setVersion(saved.version);
      setUpdatedAt(saved.updatedAt);
      setBaselineTitle(saved.title);
      setBaselineBody(saved.body);
      setStatus("saved");
      onNoteSaved?.(saved);
    } catch (error) {
      if (error instanceof NotesApiError && error.code === "version_conflict") {
        setStatus("conflict");
        setErrorMessage("This note changed somewhere else.");
        return;
      }
      setStatus("error");
      setErrorMessage(
        error instanceof NotesApiError
          ? error.message
          : "Could not save note.",
      );
    }
  }

  async function handleReloadLatest() {
    if (!onReloadLatest) return;
    setErrorMessage(null);
    const latest = await onReloadLatest(note.id);
    if (!latest) {
      setStatus("error");
      setErrorMessage("Note no longer available.");
      return;
    }
    setTitle(latest.title);
    setBody(latest.body);
    setVersion(latest.version);
    setUpdatedAt(latest.updatedAt);
    setBaselineTitle(latest.title);
    setBaselineBody(latest.body);
    setStatus("saved");
  }

  function handleKeepDraft() {
    // Leave local draft untouched; do not auto-retry.
    setStatus("unsaved");
    setErrorMessage(null);
  }

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
          <p
            className="truncate text-[11px] text-muted-foreground"
            aria-live="polite"
          >
            {statusLabel(displayStatus)}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={displayStatus === "saving" || (!isDirty && displayStatus !== "conflict")}
          onClick={() => {
            void handleSave();
          }}
          aria-label="Save note"
        >
          {displayStatus === "saving" ? "Saving…" : "Save"}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-5 sm:px-8">
          {displayStatus === "conflict" ? (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 px-3 py-2"
            >
              <p className="text-[13px] text-foreground">
                This note changed somewhere else.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void handleReloadLatest();
                  }}
                >
                  Reload latest
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleKeepDraft}
                >
                  Keep my draft
                </Button>
              </div>
            </div>
          ) : null}

          {errorMessage && displayStatus === "error" ? (
            <p role="alert" className="text-[13px] text-destructive">
              {errorMessage}
            </p>
          ) : null}

          <label className="sr-only" htmlFor={`note-title-${note.id}`}>
            Title
          </label>
          <Input
            id={`note-title-${note.id}`}
            value={title}
            onChange={(event) => handleTitleChange(event.target.value)}
            disabled={displayStatus === "saving"}
            className="h-auto border-0 bg-transparent px-0 text-[22px] font-semibold tracking-tight shadow-none focus-visible:ring-0"
            placeholder="Untitled"
            maxLength={200}
          />
          <time
            dateTime={updatedAt}
            className="font-mono text-[11px] text-muted-foreground"
          >
            Updated {formatRelativeTime(updatedAt)}
          </time>
          <label className="sr-only" htmlFor={`note-body-${note.id}`}>
            Body
          </label>
          <Textarea
            id={`note-body-${note.id}`}
            value={body}
            onChange={(event) => handleBodyChange(event.target.value)}
            disabled={displayStatus === "saving"}
            aria-label="Note content"
            className="min-h-[420px] resize-none border-0 bg-transparent px-0 font-mono text-[13px] leading-6 shadow-none focus-visible:ring-0"
            maxLength={100_000}
          />
        </div>
      </div>
    </>
  );
}

export function NoteEditor({
  note,
  onBack,
  onNoteSaved,
  onReloadLatest,
  className,
}: NoteEditorProps) {
  if (!note) {
    return (
      <div className={cn("flex h-full flex-col bg-panel", className)}>
        <EmptyState
          title="Select a note"
          description="Choose a note from the list to edit it here."
        />
      </div>
    );
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-panel", className)}>
      <NoteEditorView
        key={note.id}
        note={note}
        onBack={onBack}
        onNoteSaved={onNoteSaved}
        onReloadLatest={onReloadLatest}
      />
    </div>
  );
}
