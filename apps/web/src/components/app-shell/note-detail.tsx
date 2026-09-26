"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Dialog } from "@/components/ui/dialog";
import { useActiveOrganization, useSession } from "@/lib/auth-client";
import { formatRelativeTime } from "@/lib/date";
import {
  productRequest,
  ProductApiError,
  type Graph,
  type ProductNote,
} from "@/lib/product-api";
import {
  draftKey,
  readDraft,
  storeDraft,
  type NoteDraft,
} from "@/lib/note-drafts";
import {
  useAction,
  useNavigation,
  useProduct,
  useResource,
} from "./product-context";
import { MarkdownBody } from "./markdown";
import { NoteInspector } from "./note-inspector";
import { NoteHistory } from "./note-history";
const draftOf = (note: ProductNote): NoteDraft => ({
  title: note.title,
  body: note.body,
  summary: note.summary ?? "",
  version: note.version,
});
export function NoteDetail({ id }: { id: string }) {
  const { data, error } = useResource<ProductNote>(
    `note?id=${encodeURIComponent(id)}`,
  );
  const { refresh, workspaceId } = useProduct();
  if (!workspaceId)
    return <p className="p-8">Select a workspace to view notes.</p>;
  if (error)
    return (
      <div role="alert" className="p-8">
        <p>{error}</p>
        <Button className="mt-3" variant="outline" onClick={refresh}>
          Reload
        </Button>
      </div>
    );
  if (!data)
    return (
      <p role="status" className="p-8 text-muted-foreground">
        Loading note…
      </p>
    );
  return <DocumentView key={`${workspaceId}:${id}`} initialNote={data} />;
}
export function DocumentView({ initialNote }: { initialNote: ProductNote }) {
  const { workspaceId, mutate } = useProduct();
  const nav = useNavigation();
  const graph = useResource<Graph>("graph");
  const { data: organization } = useActiveOrganization();
  const { data: session } = useSession();
  const key = draftKey(
    session?.user.id ?? "unknown",
    workspaceId,
    initialNote.id,
  );
  const [note, setNote] = useState(initialNote);
  const [draft, setDraft] = useState<NoteDraft>(
    () => readDraft(key) ?? draftOf(initialNote),
  );
  const [editing, setEditing] = useState(() => Boolean(readDraft(key)));
  const [recovery, setRecovery] = useState<NoteDraft | null>(() =>
    readDraft(`${key}:recovery`),
  );
  const [draftStored, setDraftStored] = useState(true);
  const [conflict, setConflict] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const action = useAction();
  function receiveNote(next: ProductNote) {
    setNote((current) => (next.version >= current.version ? next : current));
  }
  const dirty =
    editing &&
    (draft.title !== note.title ||
      draft.body !== note.body ||
      draft.summary !== (note.summary ?? ""));
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  function change(next: NoteDraft) {
    setDraft(next);
    setDraftStored(storeDraft(key, next));
  }
  async function save() {
    try {
      const saved = await mutate<ProductNote>("note.update", {
        id: note.id,
        ...draft,
        expectedVersion: draft.version,
        summary: draft.summary || null,
      });
      setNote(saved);
      setDraft(draftOf(saved));
      setEditing(false);
      setConflict(false);
      storeDraft(key, null);
    } catch (error) {
      if (error instanceof ProductApiError && error.code === "version_conflict")
        setConflict(true);
      throw error;
    }
  }
  async function reloadLatest() {
    const latest = await productRequest<ProductNote>(
      workspaceId,
      `note?id=${encodeURIComponent(note.id)}`,
    );
    setRecovery(draft);
    storeDraft(`${key}:recovery`, draft);
    storeDraft(key, null);
    setNote(latest);
    setDraft(draftOf(latest));
    setEditing(true);
    setConflict(false);
  }
  const folderPath = [];
  const seen = new Set<string>();
  let folder = nav.data?.folders.find((f) => f.id === note.folderId);
  while (folder && !seen.has(folder.id)) {
    seen.add(folder.id);
    folderPath.unshift(folder);
    folder = nav.data?.folders.find((f) => f.id === folder?.parentId);
  }
  const linkedFrom =
    graph.data?.edges
      .filter((e) => e.target === note.id)
      .map((e) => graph.data!.nodes.find((n) => n.id === e.source)!)
      .filter(Boolean) ?? [];
  const authorName = organization?.members?.find(
    (m) => m.userId === note.createdByUserId,
  )?.user.name;
  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Link href="/app">{organization?.name ?? "Workspace"}</Link>
          {folderPath.map((f) => (
            <span key={f.id}>
              {" "}
              / <Link href={`/app/folders/${f.id}`}>{f.name}</Link>
            </span>
          ))}
          <span className="ml-2 hidden sm:inline">/ Note</span>
        </nav>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={note.favorited ? "Unfavorite note" : "Favorite note"}
            aria-pressed={note.favorited}
            disabled={action.busy}
            className="rounded p-2"
            onClick={() =>
              void action.run(async () => {
                const previous = note;
                setNote({ ...note, favorited: !note.favorited });
                try {
                  setNote(
                    await mutate<ProductNote>("note.favorite", {
                      id: note.id,
                      favorited: !note.favorited,
                    }),
                  );
                } catch (e) {
                  setNote(previous);
                  throw e;
                }
              })
            }
          >
            <Star
              size={15}
              fill={note.favorited ? "currentColor" : "none"}
              className={
                note.favorited ? "text-[#a66b36]" : "text-muted-foreground"
              }
            />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                setNote(
                  await mutate<ProductNote>("note.confirm", { id: note.id }),
                );
              })
            }
          >
            Confirm still true
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="xl:hidden"
            onClick={() => setInspectorOpen(true)}
          >
            About
          </Button>
          {!editing && (
            <Button
              size="sm"
              onClick={() => {
                setDraft(readDraft(key) ?? draftOf(note));
                setEditing(true);
              }}
            >
              Edit
            </Button>
          )}
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto">
          <article className="mx-auto max-w-[820px] px-5 py-9 sm:px-10 lg:py-12">
            {(note.trashedAt || note.archivedAt) && (
              <p className="mb-6 border-l-2 border-border pl-3 text-sm text-muted-foreground">
                This note is in {note.trashedAt ? "Trash" : "Archive"}. Restore
                it from About.
              </p>
            )}
            {editing ? (
              <label className="field">
                <span className="sr-only">Title</span>
                <Input
                  aria-label="Title"
                  disabled={action.busy}
                  value={draft.title}
                  onChange={(e) => change({ ...draft, title: e.target.value })}
                  maxLength={200}
                  className="h-auto border-0 px-0 text-[30px] font-semibold tracking-tight"
                />
              </label>
            ) : (
              <h1 className="break-words text-[30px] font-semibold leading-tight tracking-[-.035em]">
                {note.title}
              </h1>
            )}
            <div className="mb-8 mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span>
                {authorName
                  ? `By ${authorName}`
                  : note.createdByUserId
                    ? "Workspace member"
                    : "Author not recorded"}
              </span>
              <span aria-hidden>·</span>
              <time dateTime={note.updatedAt}>
                Updated {formatRelativeTime(note.updatedAt)}
              </time>
              <span aria-hidden>·</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="underline-offset-4 hover:underline"
                onClick={() => setHistoryOpen(true)}
              >
                History
              </Button>
            </div>
            {action.error && (
              <p role="alert" className="mb-4 text-sm text-destructive">
                {action.error}
              </p>
            )}
            {conflict && (
              <div className="mb-5 space-y-3 rounded border border-[#dcc5a4] bg-accent/50 p-4">
                <p className="text-sm">
                  This note changed somewhere else. Your draft is preserved.
                </p>
                <Button
                  variant="outline"
                  disabled={action.busy}
                  onClick={() => void action.run(reloadLatest)}
                >
                  Reload latest
                </Button>
                <p className="text-xs text-muted-foreground">
                  The current draft remains available for comparison after
                  reloading.
                </p>
              </div>
            )}
            {recovery && (
              <Accordion type="single" collapsible className="mb-5">
                <AccordionItem value="recovery">
                  <AccordionTrigger>
                    Preserved draft · version {recovery.version}
                  </AccordionTrigger>
                  <AccordionContent>
                    <h3 className="font-medium">{recovery.title}</h3>
                    <p className="whitespace-pre-wrap text-sm">
                      {recovery.summary}
                    </p>
                    <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap font-sans text-sm">
                      {recovery.body}
                    </pre>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Copy the changes you want into the latest version above.
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-3"
                      onClick={() => {
                        setRecovery(null);
                        storeDraft(`${key}:recovery`, null);
                      }}
                    >
                      Discard preserved draft
                    </Button>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
            {editing ? (
              <div className="space-y-5">
                <label className="field">
                  Summary (optional)
                  <Textarea
                    disabled={action.busy}
                    value={draft.summary}
                    onChange={(e) =>
                      change({ ...draft, summary: e.target.value })
                    }
                    rows={3}
                    maxLength={4000}
                  />
                </label>
                <label className="field">
                  <span className="sr-only">Note content</span>
                  <Textarea
                    aria-label="Note content"
                    disabled={action.busy}
                    value={draft.body}
                    onChange={(e) => change({ ...draft, body: e.target.value })}
                    maxLength={100_000}
                    className="min-h-[380px] resize-y border-0 px-0 font-mono text-[14px] leading-7"
                  />
                </label>
                <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-border bg-background py-4">
                  <Button
                    disabled={action.busy || !dirty || !draft.title.trim()}
                    onClick={() => void action.run(save)}
                  >
                    {action.busy ? "Saving…" : "Save"}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={action.busy}
                    onClick={() => {
                      storeDraft(key, null);
                      setDraft(draftOf(note));
                      setEditing(false);
                      setConflict(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <span role="status" className="text-xs text-muted-foreground">
                    {dirty
                      ? draftStored
                        ? "Unsaved · draft kept in this tab"
                        : "Unsaved · browser storage unavailable"
                      : "No unsaved changes"}
                  </span>
                </div>
              </div>
            ) : (
              <>
                {note.summary && (
                  <aside className="mb-8 rounded border border-[#e3d6bd] bg-[#faf6ed] px-4 py-3 text-[14px] leading-6">
                    {note.summary}
                  </aside>
                )}
                <MarkdownBody
                  body={note.body || "_No content yet._"}
                  nodes={graph.data?.nodes}
                />
              </>
            )}
            {linkedFrom.length > 0 && (
              <section className="mt-14 border-t border-border pt-5">
                <h2 className="eyebrow">Linked from</h2>
                <ul className="mt-3 space-y-2">
                  {linkedFrom.map((n) => (
                    <li key={n.id}>
                      <Link
                        className="text-sm hover:underline"
                        href={`/app/notes/${n.id}`}
                      >
                        {n.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </article>
        </div>
        <aside
          aria-label="Note metadata"
          className="hidden w-[256px] shrink-0 overflow-y-auto border-l border-border px-5 py-7 xl:block"
        >
          <NoteInspector note={note} onChange={receiveNote} />
        </aside>
      </div>
      {inspectorOpen && (
        <Dialog
          title="About this note"
          side="right"
          onClose={() => setInspectorOpen(false)}
        >
          <NoteInspector note={note} onChange={receiveNote} />
        </Dialog>
      )}
      {historyOpen && (
        <NoteHistory
          note={note}
          hasDraft={dirty}
          onClose={() => setHistoryOpen(false)}
          onRestore={(restored) => {
            setNote(restored);
            setDraft(draftOf(restored));
          }}
        />
      )}
    </div>
  );
}
