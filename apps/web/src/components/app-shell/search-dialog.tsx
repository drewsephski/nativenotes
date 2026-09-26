"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatRelativeTime } from "@/lib/date";
import type { NoteResults } from "@/lib/product-api";
import { useNavigation, useResource } from "./product-context";
export function SearchDialog() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    const key = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen(v => !v); } };
    window.addEventListener("native-search", show); window.addEventListener("keydown", key);
    return () => { window.removeEventListener("native-search", show); window.removeEventListener("keydown", key); };
  }, []);
  return open && <Dialog title="Search notes" onClose={() => setOpen(false)} description="Search titles, content, summaries, folders and tags in this workspace."><SearchResults onClose={() => setOpen(false)} /></Dialog>;
}
function SearchResults({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState(""); const [debounced, setDebounced] = useState("");
  useEffect(() => { const timer = setTimeout(() => setDebounced(query), 180); return () => clearTimeout(timer); }, [query]);
  const { data, error } = useResource<NoteResults>(`notes?query=${encodeURIComponent(debounced)}`); const nav = useNavigation();
  return <><Input autoFocus aria-label="Search notes" placeholder="Search your knowledge…" value={query} onChange={e => setQuery(e.target.value)} />
    {error && <p role="alert" className="mt-4 text-destructive">{error}</p>}
    <ul className="mt-4 divide-y divide-border">{data?.notes.map(note => <li key={note.id}><Link href={`/app/notes/${note.id}`} onClick={onClose} className="block rounded px-2 py-3 hover:bg-accent"><p className="font-medium">{note.title}</p><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{note.summary || note.body.slice(0, 200)}</p><p className="mt-2 text-[11px] text-muted-foreground">{nav.data?.folders.find(f => f.id === note.folderId)?.name ?? "Inbox"} · {formatRelativeTime(note.updatedAt)}</p></Link></li>)}</ul>
    {data?.notes.length === 0 && <p className="py-8 text-center text-muted-foreground">No matching notes.</p>}{data?.hasMore && <p className="text-xs text-muted-foreground">Showing the first 100 results. Refine your search.</p>}
  </>;
}
