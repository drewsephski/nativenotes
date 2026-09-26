"use client";

import { useMemo, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient, useSession } from "@/lib/auth-client";
import { slugifyWorkspaceName, suggestedWorkspaceName } from "@/lib/workspace";

interface WorkspaceOnboardingProps {
  onCreated?: () => void;
}

export function WorkspaceOnboarding({ onCreated }: WorkspaceOnboardingProps) {
  const { data: session } = useSession();
  const defaultName = useMemo(
    () => suggestedWorkspaceName(session?.user.name),
    [session?.user.name],
  );
  const [name, setName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workspaceName = name ?? defaultName;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = workspaceName.trim();
    if (!trimmed) {
      setError("Workspace name is required");
      return;
    }

    setSubmitting(true);
    setError(null);

    let slug = slugifyWorkspaceName(trimmed);
    let { data, error: createError } = await authClient.organization.create({
      name: trimmed,
      slug,
      keepCurrentActiveOrganization: false,
    });

    if (
      createError &&
      (createError.code === "ORGANIZATION_SLUG_ALREADY_TAKEN" ||
        /slug|already/i.test(createError.message || ""))
    ) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
      ({ data, error: createError } = await authClient.organization.create({
        name: trimmed,
        slug,
        keepCurrentActiveOrganization: false,
      }));
    }

    if (createError || !data) {
      setError(createError?.message || "Could not create workspace");
      setSubmitting(false);
      return;
    }

    await authClient.organization.setActive({ organizationId: data.id });
    setSubmitting(false);
    onCreated?.();
  }

  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-4">
        <BrandLogo className="mb-4" />
        <div className="space-y-1">
          <h1 className="text-[15px] font-semibold tracking-tight text-foreground">
            Create your first workspace
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Workspaces keep notes and MCP access organized.
          </p>
        </div>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <label
              htmlFor="onboarding-workspace-name"
              className="text-[12px] text-muted-foreground"
            >
              Workspace name
            </label>
            <Input
              id="onboarding-workspace-name"
              name="name"
              value={workspaceName}
              onChange={(event) => setName(event.target.value)}
              disabled={submitting}
              aria-required="true"
            />
          </div>
          {error ? (
            <p className="text-[12px] text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Creating…" : "Create workspace"}
          </Button>
        </form>
      </div>
    </div>
  );
}
