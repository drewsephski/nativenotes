"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { WorkspaceSelector } from "./workspace-selector";
import { AccountMenu } from "./account-menu";
import { FolderTree } from "./folder-tree";
import { useNavigation, useProduct } from "./product-context";
import { Dialog } from "@/components/ui/dialog";
import { CreateProductNote } from "./create-product-note";
import { FolderForm } from "./folder-settings";
import { cn } from "@/lib/utils";
interface SidebarProps { open?: boolean; onClose?: () => void }
export function Sidebar({ open, onClose }: SidebarProps) {
  const [create, setCreate] = useState(false); const [folder, setFolder] = useState(false);
  const { data, error } = useNavigation(); const { workspaceId } = useProduct();
  const pathname = usePathname();
  const nav = (href: string, label: string, count?: number) => <Link key={href} href={href} onClick={onClose} aria-current={pathname === href ? "page" : undefined} className={cn("flex min-h-8 items-center justify-between gap-2 rounded px-2 py-1.5 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground", pathname === href && "bg-accent font-medium text-foreground")}><span>{label}</span>{count !== undefined && <span className="text-[11px] tabular-nums">{count}</span>}</Link>;
  const content = <>
    <div className="flex h-14 items-center justify-between px-4"><Link href="/app" onClick={onClose} className="text-[15px] font-semibold tracking-tight">NativeNotes<span className="text-[#a66b36]">.</span></Link><button className="rounded p-1.5 hover:bg-accent disabled:opacity-40" aria-label="New note" disabled={!workspaceId} onClick={() => { onClose?.(); setCreate(true); }}><Plus size={17} /></button></div>
    <div className="px-2 pb-4"><WorkspaceSelector /></div>
    <nav aria-label="Workspace navigation" className="min-h-0 flex-1 overflow-y-auto px-2">
      <button className="mb-3 flex h-8 w-full items-center gap-2 rounded px-2 text-muted-foreground hover:bg-accent" onClick={() => { onClose?.(); window.dispatchEvent(new Event("native-search")); }}><Search size={14} /><span>Search</span><kbd className="ml-auto text-[10px]">⌘ K</kbd></button>
      {nav("/app", "All Notes", data?.counts.all)}{nav("/app/inbox", "Inbox", data?.counts.inbox)}{nav("/app/favorites", "Favorites", data?.counts.favorites)}
      <div className="mb-1 mt-7 flex items-center justify-between px-2"><Link href="/app/folders" onClick={onClose} className="eyebrow hover:text-foreground">Folders</Link><button aria-label="Create folder" disabled={!workspaceId} className="rounded p-1 hover:bg-accent" onClick={() => { onClose?.(); setFolder(true); }}><Plus size={13} /></button></div>
      {data && <FolderTree folders={data.folders} counts={data.folderCounts} activeId={pathname.split("/folders/")[1]} onNavigate={onClose} />}
      {error && <p role="alert" className="px-2 text-xs text-destructive">{error}</p>}
      <div className="mt-6">{nav("/app/instructions", "AI Instructions")}{nav("/app/tags", "Tags")}</div>
      <div className="mt-6">{nav("/app/graph", "Graph")}{nav("/app/archive", "Archive", data?.counts.archive)}{nav("/app/trash", "Trash", data?.counts.trash)}</div>
    </nav>
    <div className="mt-4 border-t border-border p-2">{nav("/app/settings", "Workspace & team")}<AccountMenu /></div>
  </>;
  return <>
    <aside id="app-sidebar" aria-label="Main navigation" className="hidden w-[232px] shrink-0 flex-col border-r border-border bg-sidebar md:flex">{content}</aside>
    {open && <Dialog title="Navigation" side="left" className="flex flex-col bg-sidebar p-2" onClose={() => onClose?.()}>{content}</Dialog>}
    {create && <CreateProductNote onClose={() => setCreate(false)} />}
    {folder && <Dialog title="Create folder" onClose={() => setFolder(false)}><FolderForm onSaved={() => setFolder(false)} /></Dialog>}
  </>;
}
