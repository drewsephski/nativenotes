"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { slugifyWorkspaceName } from "@/lib/workspace";
import { cn } from "@/lib/utils";

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName?: string;
  onCreated?: (organizationId: string) => void;
  className?: string;
}

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
  defaultName = "",
  onCreated,
  className,
}: CreateWorkspaceDialogProps) {
  const titleId = useId();
  const [name, setName] = useState(defaultName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Workspace name is required");
      return;
    }

    setSubmitting(true);
    setError(null);

    const slug = slugifyWorkspaceName(trimmed);
    const { data, error: createError } = await authClient.organization.create({
      name: trimmed,
      slug,
      keepCurrentActiveOrganization: false,
    });

    if (createError || !data) {
      const message = createError?.message || "Could not create workspace";
      const isSlugTaken =
        createError?.code === "ORGANIZATION_SLUG_ALREADY_TAKEN" ||
        /slug|already/i.test(message);
      if (isSlugTaken) {
        const retrySlug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
        const retry = await authClient.organization.create({
          name: trimmed,
          slug: retrySlug,
          keepCurrentActiveOrganization: false,
        });
        if (retry.error || !retry.data) {
          setError(retry.error?.message || message);
          setSubmitting(false);
          return;
        }
        await authClient.organization.setActive({
          organizationId: retry.data.id,
        });
        setSubmitting(false);
        onOpenChange(false);
        setName("");
        onCreated?.(retry.data.id);
        return;
      }
      setError(message);
      setSubmitting(false);
      return;
    }

    await authClient.organization.setActive({
      organizationId: data.id,
    });
    setSubmitting(false);
    onOpenChange(false);
    setName("");
    onCreated?.(data.id);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={() => {
        if (!submitting) onOpenChange(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "w-full max-w-sm rounded-md border border-border bg-panel p-4 shadow-sm",
          className,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-[14px] font-semibold text-foreground">
          Create workspace
        </h2>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Workspaces map to Better Auth organizations.
        </p>
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <label htmlFor="workspace-name" className="text-[12px] text-muted-foreground">
              Workspace name
            </label>
            <Input
              id="workspace-name"
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Acme"
              autoFocus
              disabled={submitting}
              aria-required="true"
            />
          </div>
          {error ? (
            <p className="text-[12px] text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
