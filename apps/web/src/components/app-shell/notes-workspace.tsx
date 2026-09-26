"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { formatRelativeTime } from "@/lib/date";
import type { NoteResults } from "@/lib/product-api";
import { useNavigation, useProduct, useResource } from "./product-context";
import { CreateProductNote } from "./create-product-note";
import { FolderForm } from "./folder-settings";
import { InstructionsEditor } from "./instructions-editor";
export function NotesWorkspace({ title = "All Notes", view = "all", folderId, tagId }: { title?: string; view?: string; folderId?: string; tagId?: string }) {
  const { workspaceId, refresh } = useProduct(); const nav = useNavigation();
  const [search, setSearch] = useState(""); const [offset, setOffset] = useState(0);
  const [create, setCreate] = useState(false); const [settings, setSettings] = useState(false);
  const params = new URLSearchParams({ view, offset: String(offset) });
  if (folderId) params.set("folderId", folderId); if (tagId) params.set("tagId", tagId);
  if (search) params.set("query", search);
  const { data, error } = useResource<NoteResults>(`notes?${params}`);
  const folder = nav.data?.folders.find(f => f.id === folderId);
  return <div className="page-scroll">
    <div className="page-heading"><div><p className="eyebrow">Your knowledge{folder?.archivedAt ? " · Archived folder" : ""}</p><h1>{folder?.name ?? title}</h1></div><div className="flex gap-2">{folder && <Button variant="ghost" onClick={() => setSettings(true)}>Folder settings</Button>}<Button disabled={!workspaceId} onClick={() => setCreate(true)}>New note</Button></div></div>
    {view === "trash" && <p className="mb-5 text-sm text-muted-foreground">Notes remain recoverable. The 30-day retention date is recorded; automatic permanent deletion is not enabled.</p>}
    {!workspaceId ? <p>Select a workspace to view notes.</p> : <>
      <Input aria-label="Filter notes" value={search} onChange={e => { setSearch(e.target.value); setOffset(0); }} placeholder="Filter this collection…" className="mb-6 max-w-sm" />
      {error && <div role="alert"><p>{error}</p><Button variant="outline" onClick={refresh}>Retry</Button></div>}
      {!data && !error && <p className="text-muted-foreground" role="status">Loading notes…</p>}
      {data?.notes.length === 0 && <div className="py-16"><h2 className="text-lg font-medium">No notes here</h2><p className="mt-2 text-muted-foreground">{search ? "Try a different search." : "Your notes will appear here as you organize your workspace."}</p></div>}
      <ul className="divide-y divide-border">{data?.notes.map(note => <li key={note.id}><Link className="group block rounded px-2 py-5 hover:bg-muted/50" href={`/app/notes/${note.id}`}><div className="flex items-baseline justify-between gap-3"><h2 className="text-[17px] font-medium tracking-tight">{note.title}{note.favorited && <span className="ml-2 text-xs text-[#a66b36]" aria-label="Favorite">★</span>}</h2><time className="shrink-0 text-[11px] text-muted-foreground" dateTime={note.updatedAt}>{formatRelativeTime(note.updatedAt)}</time></div><p className="mt-2 line-clamp-2 max-w-3xl text-[13px] leading-6 text-muted-foreground">{note.summary || note.body.replace(/[#*`]/g, "").slice(0, 220) || "No content yet"}</p><p className="mt-3 text-[11px] text-muted-foreground">{nav.data?.folders.find(f => f.id === note.folderId)?.name ?? "Inbox"}{note.freshness === "needs_review" ? " · Needs review" : ""}</p></Link></li>)}</ul>
      {(offset > 0 || data?.hasMore) && <div className="mt-5 flex gap-3"><Button variant="outline" disabled={!offset} onClick={() => setOffset(v => Math.max(0, v - 100))}>Previous</Button><Button variant="outline" disabled={!data?.hasMore} onClick={() => setOffset(v => v + 100)}>Next</Button></div>}
    </>}
    {create && <CreateProductNote onClose={() => setCreate(false)} />}
    {settings && folder && <Dialog title="Folder settings" onClose={() => setSettings(false)}><FolderForm folder={folder} onSaved={() => setSettings(false)} /><div className="mt-8 border-t border-border pt-6"><InstructionsEditor folderId={folder.id} /></div></Dialog>}
  </div>;
}
