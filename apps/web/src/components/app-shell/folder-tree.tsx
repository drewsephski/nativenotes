"use client";
import Link from "next/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { Folder } from "@/lib/product-api";
import { cn } from "@/lib/utils";
export function FolderTree({
  folders,
  counts,
  activeId,
  onNavigate,
}: {
  folders: Folder[];
  counts: Record<string, number>;
  activeId?: string;
  onNavigate?: () => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Children of archived folders remain accessible at the visible root.
  const visible = folders.filter((f) => !f.archivedAt);
  function branch(
    parentId: string | null,
    ancestors: Set<string>,
  ): React.ReactNode {
    return (
      <ul className={parentId ? "ml-3 border-l border-border pl-2" : ""}>
        {visible
          .filter((f) =>
            parentId === null
              ? !f.parentId || !visible.some((p) => p.id === f.parentId)
              : f.parentId === parentId,
          )
          .filter((f) => !ancestors.has(f.id))
          .map((folder) => {
            const hasChildren = visible.some((f) => f.parentId === folder.id);
            const expanded = !collapsed.has(folder.id);
            return (
              <li key={folder.id}>
                <div
                  className={cn(
                    "flex min-h-8 items-center rounded",
                    activeId === folder.id && "bg-accent",
                  )}
                >
                  {hasChildren ? (
                    <button
                      className="p-1"
                      aria-label={`${expanded ? "Collapse" : "Expand"} ${folder.name}`}
                      aria-expanded={expanded}
                      onClick={() =>
                        setCollapsed((old) => {
                          const next = new Set(old);
                          if (next.has(folder.id)) next.delete(folder.id);
                          else next.add(folder.id);
                          return next;
                        })
                      }
                    >
                      <ChevronRight
                        size={12}
                        className={expanded ? "rotate-90" : ""}
                      />
                    </button>
                  ) : (
                    <span className="w-5 shrink-0" />
                  )}
                  <Link
                    aria-label={`${folder.name}, ${counts[folder.id] ?? 0} notes`}
                    href={`/app/folders/${folder.id}`}
                    aria-current={activeId === folder.id ? "page" : undefined}
                    onClick={onNavigate}
                    className="flex min-w-0 flex-1 items-center justify-between gap-2 py-1.5 pr-2 text-[13px] hover:text-foreground"
                  >
                    <span className="truncate">{folder.name}</span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {counts[folder.id] ?? 0}
                    </span>
                  </Link>
                </div>
                {hasChildren &&
                  expanded &&
                  branch(folder.id, new Set([...ancestors, folder.id]))}
              </li>
            );
          })}
      </ul>
    );
  }
  return branch(null, new Set());
}
