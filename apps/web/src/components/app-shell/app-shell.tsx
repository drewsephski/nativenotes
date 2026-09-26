"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { AuthGate } from "@/components/app-shell/auth-gate";
import { Sidebar } from "@/components/app-shell/sidebar";
import { WorkspaceOnboarding } from "@/components/app-shell/workspace-onboarding";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  useListOrganizations,
  useActiveOrganization,
} from "@/lib/auth-client";

interface AppShellProps {
  children: React.ReactNode;
}

function AuthenticatedShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const {
    data: organizations,
    isPending: orgsPending,
    error: orgsError,
    refetch: refetchOrgs,
  } = useListOrganizations();
  const { refetch: refetchActive } = useActiveOrganization();

  const orgCount = organizations?.length ?? 0;
  const showOnboarding = !orgsPending && !orgsError && orgCount === 0;

  if (orgsPending) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background px-4">
        <div
          className="w-full max-w-sm space-y-3"
          aria-busy="true"
          aria-label="Loading workspaces"
        >
          <div className="h-3 w-28 animate-pulse rounded bg-muted" />
          <div className="h-8 w-full animate-pulse rounded-md bg-muted" />
          <div className="h-8 w-2/3 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
    );
  }

  if (orgsError) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-2 bg-background px-4 text-center">
        <p className="text-[13px] text-muted-foreground">
          Could not load workspaces.
        </p>
        <p className="font-mono text-[11px] text-muted-foreground/80">
          {orgsError.message}
        </p>
      </div>
    );
  }

  if (showOnboarding) {
    return (
      <WorkspaceOnboarding
        onCreated={() => {
          void refetchOrgs();
          void refetchActive();
        }}
      />
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-dvh min-h-0 overflow-hidden bg-background">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-11 items-center gap-2 border-b border-border px-3 md:hidden">
            <span className="min-w-0 flex-1 text-[13px] font-semibold tracking-tight">
              NativeNotes
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Open sidebar"
              aria-controls="app-sidebar"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
        </div>
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      </div>
    </TooltipProvider>
  );
}

export function AppShell({ children }: AppShellProps) {
  return (
    <AuthGate>
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </AuthGate>
  );
}
