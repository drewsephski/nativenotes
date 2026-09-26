"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createNote, NotesApiError, type Note } from "@/lib/notes-api";
import { cn } from "@/lib/utils";

interface CreateNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (note: Note) => void | Promise<void>;
  className?: string;
}

export function CreateNoteDialog({
  open,
  onOpenChange,
  onCreated,
  className,
}: CreateNoteDialogProps) {
  if (!open) return null;

  return (
    <CreateNoteDialogForm
      onOpenChange={onOpenChange}
      onCreated={onCreated}
      className={className}
    />
  );
}

function CreateNoteDialogForm({
  onOpenChange,
  onCreated,
  className,
}: {
  onOpenChange: (open: boolean) => void;
  onCreated: (note: Note) => void | Promise<void>;
  className?: string;
}) {
  const titleId = useId();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      titleInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) {
        event.preventDefault();
        onOpenChange(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [submitting, onOpenChange]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const note = await createNote({
        title: trimmedTitle,
        body,
      });
      await onCreated(note);
      onOpenChange(false);
    } catch (caught: unknown) {
      const message =
        caught instanceof NotesApiError
          ? caught.message
          : "Could not create note.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={() => {
        if (!submitting) onOpenChange(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "w-full max-w-sm rounded-md border border-border bg-panel p-4 shadow-sm",
          className,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-[14px] font-semibold text-foreground">
          New note
        </h2>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Creates a note in the active workspace.
        </p>
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <label
              htmlFor="note-title"
              className="text-[12px] text-muted-foreground"
            >
              Title
            </label>
            <Input
              ref={titleInputRef}
              id="note-title"
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Note title"
              disabled={submitting}
              aria-required="true"
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="note-body"
              className="text-[12px] text-muted-foreground"
            >
              Body{" "}
              <span className="text-muted-foreground/70">(optional)</span>
            </label>
            <Textarea
              id="note-body"
              name="body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Start writing…"
              disabled={submitting}
              rows={4}
            />
          </div>
          {error ? (
            <p className="text-[12px] text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Creating…" : "Create note"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
