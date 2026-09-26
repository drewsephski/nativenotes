"use client";

import { cn } from "@/lib/utils";
import {
  formatRelativeTime,
  type MockNote,
} from "@/lib/mock-data";
import { EmptyState } from "@/components/app-shell/empty-state";

interface NotesListProps {
  notes: MockNote[];
  selectedId?: string | null;
  onSelect: (note: MockNote) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

export function NotesList({
  notes,
  selectedId,
  onSelect,
  emptyTitle = "No notes here yet.",
  emptyDescription = "Create a note or move one into this folder.",
  className,
}: NotesListProps) {
  if (notes.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
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
          <li key={note.id} role="option" aria-selected={selected}>
            <button
              type="button"
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
              {note.tags[0] ? (
                <span className="mt-0.5 w-fit rounded-sm border border-border px-1 py-px text-[10px] text-muted-foreground">
                  {note.tags[0]}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
