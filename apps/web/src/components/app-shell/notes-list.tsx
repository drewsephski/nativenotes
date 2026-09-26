"use client";

import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/date";
import type { NoteListItem } from "@/lib/notes-api";
import { EmptyState } from "@/components/app-shell/empty-state";

interface NotesListProps {
  notes: NoteListItem[];
  selectedId?: string | null;
  onSelect: (note: NoteListItem) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  onCreateNote?: () => void;
  className?: string;
}

export function NotesList({
  notes,
  selectedId,
  onSelect,
  emptyTitle = "No notes yet.",
  emptyDescription = "Your notes will appear here.",
  onCreateNote,
  className,
}: NotesListProps) {
  if (notes.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        actionLabel={onCreateNote ? "Create note" : undefined}
        onAction={onCreateNote}
        className={className}
      />
    );
  }

  return (
    <ul
      role="listbox"
      aria-label="Notes"
      className={cn("divide-y divide-border overflow-y-auto", className)}
    >
      {notes.map((note) => {
        const selected = note.id === selectedId;
        return (
          <li key={note.id}>
            <button
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onSelect(note)}
              className={cn(
                "flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors",
                "hover:bg-accent/70",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                selected && "bg-accent",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={cn(
                    "truncate text-[13px] leading-snug",
                    selected ? "font-medium text-foreground" : "text-foreground",
                  )}
                >
                  {note.title}
                </span>
                <time
                  dateTime={note.updatedAt}
                  className="shrink-0 font-mono text-[10px] text-muted-foreground"
                >
                  {formatRelativeTime(note.updatedAt)}
                </time>
              </div>
              <p className="line-clamp-2 text-[12px] leading-snug text-muted-foreground">
                {note.preview}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
