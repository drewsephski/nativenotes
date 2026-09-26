"use client";

import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { NoteEditor } from "@/components/app-shell/note-editor";
import { NotesList } from "@/components/app-shell/notes-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActiveOrganization } from "@/lib/auth-client";
import {
  fetchNotes,
  toNoteListItem,
  type NoteListItem,
  NotesApiError,
} from "@/lib/notes-api";
import { cn } from "@/lib/utils";

type LoadState =
  | { status: "loading" }
  | { status: "success"; notes: NoteListItem[] }
  | { status: "error"; message: string };

interface NotesWorkspaceProps {
  title?: string;
}

/**
 * Remounts the loader when the active workspace changes so previous-tenant
 * notes never flash into the new workspace.
 */
export function NotesWorkspace({ title = "All Notes" }: NotesWorkspaceProps) {
  const { data: activeOrganization, isPending: activePending } =
    useActiveOrganization();
  const workspaceId = activeOrganization?.id ?? null;

  if (activePending) {
    return <NotesWorkspaceFrame title={title} loadState={{ status: "loading" }} />;
  }

  if (!workspaceId) {
    return (
      <NotesWorkspaceFrame
        title={title}
        loadState={{
          status: "error",
          message: "Select a workspace to view notes.",
        }}
      />
    );
  }

  return (
    <NotesWorkspaceLoader
      key={workspaceId}
      title={title}
      workspaceId={workspaceId}
    />
  );
}

function NotesWorkspaceLoader({
  title,
  workspaceId,
}: {
  title: string;
  workspaceId: string;
}) {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileShowEditor, setMobileShowEditor] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void fetchNotes()
      .then((notes) => {
        if (cancelled) return;
        const items = notes.map(toNoteListItem);
        setLoadState({ status: "success", notes: items });
        setSelectedId(items[0]?.id ?? null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof NotesApiError
            ? error.message
            : "Could not load notes.";
        setLoadState({ status: "error", message });
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceId, retryToken]);

  return (
    <NotesWorkspaceFrame
      title={title}
      loadState={loadState}
      selectedId={selectedId}
      onSelect={(note) => {
        setSelectedId(note.id);
        setMobileShowEditor(true);
      }}
      mobileShowEditor={mobileShowEditor}
      onBack={() => setMobileShowEditor(false)}
      onRetry={() => {
        setSelectedId(null);
        setLoadState({ status: "loading" });
        setRetryToken((value) => value + 1);
      }}
    />
  );
}

function NotesWorkspaceFrame({
  title,
  loadState,
  selectedId = null,
  onSelect,
  mobileShowEditor = false,
  onBack,
  onRetry,
}: {
  title: string;
  loadState: LoadState;
  selectedId?: string | null;
  onSelect?: (note: NoteListItem) => void;
  mobileShowEditor?: boolean;
  onBack?: () => void;
  onRetry?: () => void;
}) {
  const notes =
    loadState.status === "success" ? loadState.notes : ([] as NoteListItem[]);
  const selected = notes.find((note) => note.id === selectedId) ?? null;
  const isLoading = loadState.status === "loading";
  const isError = loadState.status === "error";

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
              {!isLoading && !isError ? (
                <span className="font-mono text-[11px] text-muted-foreground">
                  {notes.length}
                </span>
              ) : null}
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            aria-label="New note"
            disabled
            title="Note creation is not available yet"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            New note
          </Button>
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
              disabled
              aria-describedby="notes-search-hint"
            />
          </div>
          <p id="notes-search-hint" className="sr-only">
            Search is not available yet.
          </p>
        </div>

        {isLoading ? (
          <NotesListSkeleton />
        ) : isError ? (
          <div className="flex flex-1 flex-col items-start justify-center gap-2 px-4 py-8">
            <p className="text-[13px] text-muted-foreground">
              {loadState.message}
            </p>
            {onRetry ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRetry}
                aria-label="Retry loading notes"
              >
                Retry
              </Button>
            ) : null}
          </div>
        ) : (
          <NotesList
            notes={notes}
            selectedId={selectedId}
            onSelect={onSelect ?? (() => undefined)}
            emptyTitle="No notes yet."
            emptyDescription="Your notes will appear here."
            className="min-h-0 flex-1"
          />
        )}
      </section>

      <section
        className={cn(
          "min-w-0 flex-1",
          mobileShowEditor ? "flex" : "hidden md:flex",
        )}
      >
        <NoteEditor
          note={isLoading || isError ? null : selected}
          onBack={onBack}
          className="w-full"
          readOnly
        />
      </section>
    </div>
  );
}

function NotesListSkeleton() {
  return (
    <div
      className="min-h-0 flex-1 space-y-0 divide-y divide-border overflow-hidden"
      aria-busy="true"
      aria-label="Loading notes"
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="space-y-2 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="h-3 w-2/5 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-10 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-2.5 w-4/5 animate-pulse rounded bg-muted" />
          <div className="h-2.5 w-3/5 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
