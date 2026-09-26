"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronRight,
  FileText,
  Folder,
  Plus,
  Settings,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { WorkspaceSelector } from "@/components/app-shell/workspace-selector";
import { AccountMenu } from "@/components/app-shell/account-menu";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { MOCK_FOLDERS } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
  className?: string;
}

const PRIMARY_NAV = [
  { href: "/app", label: "All Notes", icon: FileText, exact: true },
  { href: "/app/favorites", label: "Favorites", icon: Star, exact: false },
] as const;

const BOTTOM_NAV = [
  { href: "/app/trash", label: "Trash", icon: Trash2 },
  { href: "/app/settings", label: "Settings", icon: Settings },
] as const;

function isActivePath(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ open = true, onClose, className }: SidebarProps) {
  const pathname = usePathname();
  const rootFolders = MOCK_FOLDERS.filter((folder) => !folder.parentId);

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/40 md:hidden",
          open ? "block" : "hidden",
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        id="app-sidebar"
        aria-label="Main navigation"
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-[232px] flex-col border-l border-border bg-sidebar text-sidebar-foreground",
          "transition-transform duration-200 ease-out md:static md:translate-x-0",
          open ? "translate-x-0" : "translate-x-full",
          className,
        )}
      >
        <div className="flex h-12 items-center justify-between gap-2 px-3">
          <Link
            href="/app"
            className="truncate text-[13px] font-semibold tracking-tight text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            NativeNotes
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            aria-label="Close sidebar"
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="px-2 pb-2">
          <WorkspaceSelector />
        </div>

        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-2 pb-3">
          <ul className="space-y-0.5" role="list">
            {PRIMARY_NAV.map((item) => {
              const Icon = item.icon;
              const active = isActivePath(pathname, item.href, item.exact);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      "flex h-8 items-center gap-2 rounded-md px-2 text-[13px]",
                      "hover:bg-accent hover:text-accent-foreground",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "bg-accent font-medium text-foreground"
                        : "text-muted-foreground",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div>
            <div className="mb-1 flex h-7 items-center justify-between px-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Folders
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="New folder (not available yet)"
                disabled
                title="Folders are not wired yet"
                className="h-6 w-6 text-muted-foreground"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
            <p className="mb-1 px-2 text-[10px] text-muted-foreground/80">
              Preview only — not wired
            </p>
            <ul className="space-y-0.5" role="list">
              {rootFolders.map((folder) => {
                const children = MOCK_FOLDERS.filter(
                  (child) => child.parentId === folder.id,
                );
                return (
                  <li key={folder.id}>
                    <button
                      type="button"
                      disabled
                      title="Folders are not wired yet"
                      className={cn(
                        "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-muted-foreground",
                        "opacity-70",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      )}
                    >
                      <Folder className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground/80">
                        {folder.noteCount}
                      </span>
                    </button>
                    {children.length > 0 ? (
                      <ul className="ml-3 space-y-0.5 border-l border-border pl-2" role="list">
                        {children.map((child) => (
                          <li key={child.id}>
                            <button
                              type="button"
                              disabled
                              title="Folders are not wired yet"
                              className={cn(
                                "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] text-muted-foreground",
                                "opacity-70",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              )}
                            >
                              <ChevronRight
                                className="h-3 w-3 shrink-0 opacity-60"
                                aria-hidden="true"
                              />
                              <span className="min-w-0 flex-1 truncate">
                                {child.name}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>

        <div className="mt-auto space-y-2 border-t border-border p-2">
          <ul className="space-y-0.5" role="list">
            {BOTTOM_NAV.map((item) => {
              const Icon = item.icon;
              const active = isActivePath(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      "flex h-8 items-center gap-2 rounded-md px-2 text-[13px]",
                      "hover:bg-accent hover:text-accent-foreground",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "bg-accent font-medium text-foreground"
                        : "text-muted-foreground",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <Separator />
          <AccountMenu />
        </div>
      </aside>
    </>
  );
}
