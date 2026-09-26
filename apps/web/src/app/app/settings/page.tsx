import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { MOCK_WORKSPACES } from "@/lib/mock-data";

export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  const workspace = MOCK_WORKSPACES[1] ?? MOCK_WORKSPACES[0];

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex h-11 items-center border-b border-border px-4">
        <h1 className="text-[13px] font-semibold text-foreground">Settings</h1>
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-6 sm:px-6">
        <section aria-labelledby="workspace-heading" className="space-y-4">
          <div>
            <h2
              id="workspace-heading"
              className="text-[13px] font-semibold text-foreground"
            >
              Workspace
            </h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Basic workspace details. Persistence comes later.
            </p>
          </div>
          <div className="space-y-2">
            <label
              htmlFor="workspace-name"
              className="block text-[12px] font-medium text-foreground"
            >
              Workspace name
            </label>
            <Input
              id="workspace-name"
              defaultValue={workspace?.name ?? "Personal"}
              readOnly
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="workspace-slug"
              className="block text-[12px] font-medium text-foreground"
            >
              Slug
            </label>
            <Input
              id="workspace-slug"
              defaultValue={workspace?.slug ?? "personal"}
              className="font-mono"
              readOnly
            />
          </div>
          <Button type="button" variant="secondary" size="sm" disabled>
            Save changes
          </Button>
        </section>

        <Separator />

        <section aria-labelledby="ai-heading" className="space-y-4">
          <div>
            <h2
              id="ai-heading"
              className="text-[13px] font-semibold text-foreground"
            >
              AI Instructions
            </h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              These instructions will be available to connected AI clients as
              global context for this workspace.
            </p>
          </div>
          <div className="space-y-2">
            <label
              htmlFor="workspace-instructions"
              className="block text-[12px] font-medium text-foreground"
            >
              Workspace instructions
            </label>
            <Textarea
              id="workspace-instructions"
              rows={6}
              defaultValue={`You are assisting with NativeNotes — a developer-first notes product.

Prefer concise answers. Treat workspace notes as primary context. Do not invent OAuth or MCP behavior that conflicts with the existing server.`}
              className="font-mono text-[12px] leading-5"
            />
          </div>
          <Button type="button" variant="secondary" size="sm" disabled>
            Save instructions
          </Button>
        </section>

        <Separator />

        <section aria-labelledby="connections-heading" className="space-y-4">
          <div>
            <h2
              id="connections-heading"
              className="text-[13px] font-semibold text-foreground"
            >
              Connections
            </h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Status of clients and endpoints for this workspace.
            </p>
          </div>
          <ul
            role="list"
            className="divide-y divide-border rounded-md border border-border"
          >
            <li className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div>
                <p className="text-[13px] font-medium text-foreground">
                  ChatGPT
                </p>
                <p className="text-[12px] text-muted-foreground">
                  OAuth-connected MCP client
                </p>
              </div>
              <Badge variant="success">Connected</Badge>
            </li>
            <li className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div>
                <p className="text-[13px] font-medium text-foreground">
                  MCP endpoint
                </p>
                <p className="text-[12px] text-muted-foreground">
                  Server tools and resources
                </p>
              </div>
              <Badge variant="success">Enabled</Badge>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
