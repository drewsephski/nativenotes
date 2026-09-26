"use client";

import { useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { getSignInUrl } from "@/lib/config";

interface AuthGateProps {
  children: React.ReactNode;
}

/**
 * Protects `/app` using the existing backend Better Auth session.
 * Unauthenticated users are sent to the Node sign-in UI (not a Next login page).
 */
export function AuthGate({ children }: AuthGateProps) {
  const { data: session, isPending, error } = useSession();

  useEffect(() => {
    if (isPending) return;
    if (session) return;
    // Session missing or fetch failed without a session — use backend sign-in.
    window.location.assign(getSignInUrl("/app"));
  }, [isPending, session]);

  if (isPending) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-3" aria-busy="true" aria-label="Loading session">
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          <div className="h-8 w-full animate-pulse rounded-md bg-muted" />
          <div className="h-8 w-3/4 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-background px-4 text-center">
        <p className="text-[13px] text-muted-foreground">
          Unable to reach NativeNotes auth. Is the backend running?
        </p>
        <p className="font-mono text-[11px] text-muted-foreground/80">
          {error.message || "Session fetch failed"}
        </p>
        <a
          href={getSignInUrl("/app")}
          className="text-[13px] text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Try sign in
        </a>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background px-4">
        <p className="text-[13px] text-muted-foreground">Redirecting to sign in…</p>
      </div>
    );
  }

  return <>{children}</>;
}
