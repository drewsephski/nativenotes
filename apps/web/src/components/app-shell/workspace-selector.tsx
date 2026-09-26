"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { CreateWorkspaceDialog } from "@/components/app-shell/create-workspace-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import {
  authClient,
  useActiveOrganization,
  useListOrganizations,
} from "@/lib/auth-client";
import { cn } from "@/lib/utils";

/**
 * Web active workspace is session UI state. MCP tenant is authorization-grant state.
 * Switching here calls Better Auth setActiveOrganization only — it must not retarget
 * oauth_grant_tenant / MCP consent grant binding.
 */
interface WorkspaceSelectorProps {
  className?: string;
}

export function WorkspaceSelector({ className }: WorkspaceSelectorProps) {
  const {
    data: organizations,
    isPending: orgsPending,
    error: orgsError,
    refetch: refetchOrgs,
  } = useListOrganizations();
  const {
    data: activeOrganization,
    isPending: activePending,
    refetch: refetchActive,
  } = useActiveOrganization();

  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const loading = orgsPending || activePending;
  const list = organizations ?? [];
  // A fresh login can have memberships without an active session workspace.
  // Do not mark the first membership active until setActive succeeds.
  const active = activeOrganization;

  async function handleSelect(organizationId: string) {
    if (organizationId === active?.id) return;
    setSwitchingId(organizationId);
    setSwitchError(null);
    const { error } = await authClient.organization.setActive({
      organizationId,
    });
    if (error) {
      setSwitchError(error.message || "Could not switch workspace");
      setSwitchingId(null);
      return;
    }
    await Promise.all([refetchActive(), refetchOrgs()]);
    setSwitchingId(null);
  }

  function handleCreated() {
    void refetchOrgs();
    void refetchActive();
  }

  if (loading) {
    return (
      <div
        className={cn(
          "flex h-8 w-full items-center gap-2 rounded-md px-2",
          className,
        )}
        aria-busy="true"
        aria-label="Loading workspaces"
      >
        <span className="h-5 w-5 animate-pulse rounded-[4px] bg-muted" />
        <span className="h-3 flex-1 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (orgsError) {
    return (
      <p className="px-2 text-[12px] text-destructive" role="alert">
        {orgsError.message || "Could not load workspaces"}
      </p>
    );
  }

  if (list.length === 0) {
    return null;
  }

  const displayName = active?.name ?? "Select workspace";

  return (
    <>
      <div className="space-y-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Workspace: ${displayName}`}
              disabled={switchingId !== null}
              className={cn(
                "flex h-8 w-full items-center gap-2 rounded-md border border-transparent px-2 text-left text-[13px]",
                "hover:border-border hover:bg-accent",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:opacity-60",
                className,
              )}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] border border-border bg-muted text-[10px] font-semibold text-muted-foreground">
                {displayName.charAt(0)}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                {switchingId ? "Switching…" : displayName}
              </span>
              <ChevronsUpDown
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-[220px]"
            onCloseAutoFocus={(event) => {
              if (createOpen) event.preventDefault();
            }}
          >
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            {list.map((organization) => {
              const isActive = organization.id === active?.id;
              return (
                <DropdownMenuItem
                  key={organization.id}
                  onSelect={() => void handleSelect(organization.id)}
                  className="justify-between"
                  disabled={switchingId !== null}
                >
                  <span className="truncate">{organization.name}</span>
                  {isActive ? (
                    <Check
                      className="h-3.5 w-3.5 text-foreground"
                      aria-hidden="true"
                    />
                  ) : null}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Create workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {switchError ? (
          <p className="px-2 text-[11px] text-destructive" role="alert">
            {switchError}
          </p>
        ) : null}
      </div>
      <CreateWorkspaceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />
    </>
  );
}
