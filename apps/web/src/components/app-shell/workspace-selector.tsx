"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";
import {
  MOCK_WORKSPACES,
  type MockWorkspace,
} from "@/lib/mock-data";

interface WorkspaceSelectorProps {
  workspaces?: MockWorkspace[];
  initialWorkspaceId?: string;
  className?: string;
  onWorkspaceChange?: (workspace: MockWorkspace) => void;
}

/**
 * Mock workspace switcher.
 * API shape is compatible with Better Auth Organization later
 * (id / name / slug). No organization APIs are called yet.
 */
export function WorkspaceSelector({
  workspaces = MOCK_WORKSPACES,
  initialWorkspaceId = MOCK_WORKSPACES[0]?.id,
  className,
  onWorkspaceChange,
}: WorkspaceSelectorProps) {
  const [activeId, setActiveId] = useState(
    initialWorkspaceId ?? workspaces[0]?.id ?? "",
  );
  const active =
    workspaces.find((workspace) => workspace.id === activeId) ?? workspaces[0];

  function handleSelect(workspace: MockWorkspace) {
    setActiveId(workspace.id);
    onWorkspaceChange?.(workspace);
  }

  if (!active) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Workspace: ${active.name}`}
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-md border border-transparent px-2 text-left text-[13px]",
            "hover:border-border hover:bg-accent",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] border border-border bg-muted text-[10px] font-semibold text-muted-foreground">
            {active.name.charAt(0)}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium text-foreground">
            {active.name}
          </span>
          <ChevronsUpDown
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[220px]">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        {workspaces.map((workspace) => {
          const isActive = workspace.id === active.id;
          return (
            <DropdownMenuItem
              key={workspace.id}
              onSelect={() => handleSelect(workspace)}
              className="justify-between"
            >
              <span className="truncate">{workspace.name}</span>
              {isActive ? (
                <Check className="h-3.5 w-3.5 text-foreground" aria-hidden="true" />
              ) : null}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Create workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
