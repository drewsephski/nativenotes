import { RotateCcw } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/app-shell/empty-state";
import { Button } from "@/components/ui/button";
import {
  formatAbsoluteDate,
  getTrashedNotes,
} from "@/lib/mock-data";

export const metadata: Metadata = {
  title: "Trash",
};

export default function TrashPage() {
  const notes = getTrashedNotes();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center border-b border-border px-4">
        <h1 className="text-[13px] font-semibold text-foreground">Trash</h1>
        <span className="ml-2 font-mono text-[11px] text-muted-foreground">
          {notes.length}
        </span>
      </div>

      <div className="border-b border-border px-4 py-3">
        <p className="text-[12px] text-muted-foreground">
          Items in Trash will eventually be removed permanently.
        </p>
      </div>

      {notes.length === 0 ? (
        <EmptyState
          title="Trash is empty."
          description="Deleted notes will appear here."
        />
      ) : (
        <ul role="list" className="divide-y divide-border overflow-y-auto">
          {notes.map((note) => (
            <li
              key={note.id}
              className="flex items-start justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-foreground">
                  {note.title}
                </p>
                <p className="mt-0.5 line-clamp-1 text-[12px] text-muted-foreground">
                  {note.preview}
                </p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  Deleted{" "}
                  {note.deletedAt
                    ? formatAbsoluteDate(note.deletedAt)
                    : formatAbsoluteDate(note.updatedAt)}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Restore ${note.title}`}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
