"use client";

import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { NoteEditor } from "@/components/app-shell/note-editor";
import { NotesList } from "@/components/app-shell/notes-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MockNote } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

interface NotesWorkspaceProps {
  title: string;
  notes: MockNote[];
  emptyTitle?: string;
  emptyDescription?: string;
  showNewNote?: boolean;
}

export function NotesWorkspace({
  title,
  notes,
  emptyTitle,
  emptyDescription,
  showNewNote = true,
}: NotesWorkspaceProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    notes[0]?.id ?? null,
  );
  const [mobileShowEditor, setMobileShowEditor] = useState(false);
  const selected = notes.find((note) => note.id === selectedId) ?? null;

  function handleSelect(note: MockNote) {
    setSelectedId(note.id);
    setMobileShowEditor(true);
  }

  return (
    <div className="flex h-full min-h-0">
      <section
        className={cn(
          "flex w-full min-w-0 flex-col border-r border-border bg-background md:w-[340px] md:shrink-0 lg:w-[360px]",
          mobileShowEditor ? "hidden md:flex" : "flex",
        )}
      >
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <h1 className="truncate text-[13px] font-semibold text-foreground">
                {title}
              </h1>
              <span className="font-mono text-[11px] text-muted-foreground">
                {notes.length}
              </span>
            </div>
          </div>
          {showNewNote ? (
            <Button type="button" size="sm" aria-label="New note">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              New note
            </Button>
          ) : null}
        </div>
        <div className="border-b border-border p-2">
          <label className="sr-only" htmlFor="notes-search">
            Search notes
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="notes-search"
              placeholder="Search notes…"
              className="pl-8"
              readOnly
              aria-describedby="notes-search-hint"
            />
          </div>
          <p id="notes-search-hint" className="sr-only">
            Search is a placeholder in this shell.
          </p>
        </div>
        <NotesList
          notes={notes}
          selectedId={selectedId}
          onSelect={handleSelect}
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
          className="min-h-0 flex-1"
        />
      </section>

      <section
        className={cn(
          "min-w-0 flex-1",
          mobileShowEditor ? "flex" : "hidden md:flex",
        )}
      >
        <NoteEditor
          note={selected}
          onBack={() => setMobileShowEditor(false)}
          className="w-full"
        />
      </section>
    </div>
  );
}
