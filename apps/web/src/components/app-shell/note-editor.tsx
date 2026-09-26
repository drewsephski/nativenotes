"use client";

import { useState } from "react";
import {
  ArrowLeft,
  MoreHorizontal,
  Star,
} from "lucide-react";
import { EmptyState } from "@/components/app-shell/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import {
  formatRelativeTime,
  type MockNote,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";

interface NoteEditorProps {
  note: MockNote | null;
  onBack?: () => void;
  className?: string;
}

function NoteEditorForm({
  note,
  onBack,
}: {
  note: MockNote;
  onBack?: () => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [favorite, setFavorite] = useState(note.favorite);

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
            {note.folderName ?? "Inbox"}
          </p>
        </div>
        <span className="hidden text-[11px] text-muted-foreground sm:inline">
          Saved
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={favorite}
          onClick={() => setFavorite((value) => !value)}
        >
          <Star
            className={cn(
              "h-3.5 w-3.5",
              favorite
                ? "fill-foreground text-foreground"
                : "text-muted-foreground",
            )}
            aria-hidden="true"
          />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Note actions"
            >
              <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Duplicate</DropdownMenuItem>
            <DropdownMenuItem>Move to folder</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive">
              Move to Trash
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-5 sm:px-8">
          <label className="sr-only" htmlFor={`note-title-${note.id}`}>
            Note title
          </label>
          <input
            id={`note-title-${note.id}`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full bg-transparent text-[22px] font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="Untitled"
          />
          <div className="flex flex-wrap items-center gap-2">
            <time
              dateTime={note.updatedAt}
              className="font-mono text-[11px] text-muted-foreground"
            >
              Updated {formatRelativeTime(note.updatedAt)}
            </time>
            {note.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
          <label className="sr-only" htmlFor={`note-body-${note.id}`}>
            Note content
          </label>
          <textarea
            id={`note-body-${note.id}`}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            spellCheck={false}
            className="min-h-[420px] w-full resize-none bg-transparent font-mono text-[13px] leading-6 text-foreground/90 outline-none placeholder:text-muted-foreground"
            placeholder="Start writing…"
          />
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
      <NoteEditorForm key={note.id} note={note} onBack={onBack} />
    </div>
  );
}
