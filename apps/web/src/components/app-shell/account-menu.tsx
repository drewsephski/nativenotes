"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { useSession, signOut } from "@/lib/auth-client";
import { getSignInUrl } from "@/lib/config";
import { userInitials } from "@/lib/workspace";
import { cn } from "@/lib/utils";

interface AccountMenuProps {
  className?: string;
}

export function AccountMenu({ className }: AccountMenuProps) {
  const { data: session, isPending } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const user = session?.user;

  async function handleSignOut() {
    setSigningOut(true);
    setError(null);
    const { error: signOutError } = await signOut();
    if (signOutError) {
      setError(signOutError.message || "Sign out failed");
      setSigningOut(false);
      return;
    }
    window.location.assign(getSignInUrl("/app"));
  }

  if (isPending) {
    return (
      <div
        className={cn("flex items-center gap-2 rounded-md px-2 py-1.5", className)}
        aria-busy="true"
        aria-label="Loading account"
      >
        <span className="h-6 w-6 animate-pulse rounded-full bg-muted" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          <div className="h-2.5 w-28 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  const initials = userInitials(user.name, user.email);
  const image = user.image;

  return (
    <div className={cn("space-y-1", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Account menu"
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left",
              "hover:bg-accent",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element -- Google avatar URLs; avoid next/image remote config for this task
              <img
                src={image}
                alt=""
                width={24}
                height={24}
                className="h-6 w-6 shrink-0 rounded-full border border-border object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-[10px] font-medium text-muted-foreground"
                aria-hidden="true"
              >
                {initials}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium text-foreground">
                {user.name || "Account"}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-[220px]">
          <DropdownMenuLabel className="font-normal">
            <span className="block truncate text-[12px] text-muted-foreground">
              {user.email}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={signingOut}
            onSelect={(event) => {
              event.preventDefault();
              void handleSignOut();
            }}
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            {signingOut ? "Signing out…" : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? (
        <p className="px-2 text-[11px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
