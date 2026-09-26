"use client";
import { useState } from "react";
import Link from "next/link";
import {
  authClient,
  useActiveOrganization,
  useListOrganizations,
  useSession,
} from "@/lib/auth-client";
import { getNativeNotesApiUrl } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "./product-context";
export function SettingsPage() {
  const { data: workspace, refetch } = useActiveOrganization();
  const { refetch: refetchList } = useListOrganizations();
  const { data: session } = useSession();
  const action = useAction();
  const [saved, setSaved] = useState(false);
  if (!workspace)
    return <p className="p-8">Select a workspace to view settings.</p>;
  const role = workspace.members?.find(
    (m) => m.userId === session?.user.id,
  )?.role;
  const canManage = role
    ?.split(",")
    .some((r) => ["owner", "admin"].includes(r.trim()));
  return (
    <div className="page-scroll">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Workspace & team</h1>
        </div>
      </div>
      <section className="mb-8 space-y-5">
        <h2 className="font-semibold">Workspace</h2>
        <form
          key={workspace.id}
          className="max-w-lg space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            void action.run(async () => {
              const result = await authClient.organization.update({
                organizationId: workspace.id,
                data: {
                  name: String(form.get("name")),
                  slug: String(form.get("slug")),
                },
              });
              if (result.error) throw new Error(result.error.message);
              await Promise.all([refetch(), refetchList()]);
              setSaved(true);
            });
          }}
        >
          <label className="field">
            Workspace name
            <Input
              name="name"
              defaultValue={workspace.name}
              required
              maxLength={100}
              readOnly={!canManage}
              onChange={() => setSaved(false)}
            />
          </label>
          <label className="field">
            Slug
            <Input
              name="slug"
              defaultValue={workspace.slug}
              required
              pattern="[a-z0-9-]+"
              readOnly={!canManage}
              onChange={() => setSaved(false)}
            />
          </label>
          {canManage && <Button disabled={action.busy}>Save workspace</Button>}
          {saved && (
            <p role="status" className="text-xs text-muted-foreground">
              Workspace saved.
            </p>
          )}
          {action.error && (
            <p role="alert" className="text-destructive">
              {action.error}
            </p>
          )}
        </form>
      </section>
      <section className="border-t border-border py-7">
        <h2 className="mb-3 font-semibold">Team</h2>
        <ul className="divide-y divide-border">
          {workspace.members?.map((member) => (
            <li
              key={member.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div>
                <p>{member.user.name}</p>
                <p className="text-xs text-muted-foreground">
                  {member.user.email}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {member.role}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Switch or create workspaces from the workspace selector.
        </p>
      </section>
      <section className="space-y-3 border-t border-border py-7">
        <h2 className="font-semibold">AI Instructions</h2>
        <p className="text-muted-foreground">
          Manage the persisted instructions AI clients can read for this
          workspace.
        </p>
        <Link className="underline underline-offset-4" href="/app/instructions">
          Edit workspace instructions
        </Link>
      </section>
      <section className="space-y-3 border-t border-border py-7">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">MCP endpoint</h2>
          <span className="text-xs text-muted-foreground">Enabled</span>
        </div>
        <code className="block break-all text-sm">
          {getNativeNotesApiUrl()}/mcp
        </code>
        <p className="text-sm text-muted-foreground">
          Clients authorize individually. Each authorization stays bound to the
          workspace chosen during consent.
        </p>
      </section>
    </div>
  );
}
