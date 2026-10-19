"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { productRequest } from "@/lib/product-api";
import { getNativeNotesApiUrl } from "@/lib/config";
import { useAction, useProduct, useResource } from "./product-context";

type Connection = {
  id: string;
  clientId: string;
  clientName: string | null;
  scopes: string[];
  createdAt: string;
  revokedAt: string | null;
};
type Connections = {
  connections: Connection[];
  policy: { requireReview: boolean };
  canManagePolicy: boolean;
};
export function ConnectedApps() {
  const { workspaceId } = useProduct();
  return <WorkspaceConnections key={workspaceId} workspaceId={workspaceId} />;
}
function WorkspaceConnections({ workspaceId }: { workspaceId: string }) {
  const { data, error } = useResource<Connections>("connections");
  const { refresh } = useProduct();
  const action = useAction();
  const [selected, setSelected] = useState<Connection | null>(null);
  return (
    <section className="space-y-4 border-t border-border py-7">
      <h2 className="font-semibold">Connected apps</h2>
      <p className="text-sm text-muted-foreground">
        Your authorizations for this workspace. Each client connects
        independently to{" "}
        <code className="break-all">{getNativeNotesApiUrl()}/mcp</code>.
      </p>
      <div className="space-y-2 rounded-lg border border-border p-4 text-sm">
        <p>
          Start with <strong>Read and propose</strong> (
          <code>mcp:read mcp:propose</code>) for changes you review in
          NativeNotes.
        </p>
        <p>
          Use <strong>Read only</strong> (<code>mcp:read</code>) for retrieval,
          or <strong>Direct write</strong> (<code>mcp:read mcp:write</code>)
          when the agent may save changes immediately.
        </p>
        <p className="text-muted-foreground">
          Request these scopes in your MCP client and select this workspace
          during consent. Instruction changes additionally require{" "}
          <code>mcp:instructions</code>. To reduce access, revoke existing
          authorizations before reconnecting with narrower scopes.
        </p>
      </div>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Loading connections…</p>}
      {data && (
        <>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={data.policy.requireReview}
              disabled={!data.canManagePolicy || action.busy}
              onChange={(event) => {
                const requireReview = event.target.checked;
                void action.run(async () => {
                  await productRequest(workspaceId, "mcp-policy", {
                    command: "policy.update",
                    input: { requireReview },
                  });
                  refresh();
                });
              }}
            />
            <span>
              <strong>Require human review for MCP changes</strong>
              <span className="mt-1 block text-muted-foreground">
                Blocks direct writes from every MCP client, including existing
                write grants. Agents can submit proposals for existing notes;
                capture new notes in the app. Owners and admins can change this
                setting.
              </span>
            </span>
          </label>
          {data.connections.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No apps authorized by you for this workspace.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {data.connections.map((connection) => (
                <li key={connection.id} className="space-y-2 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium">
                      {connection.clientName ?? connection.clientId}
                    </p>
                    {connection.revokedAt ? (
                      <span className="text-sm text-muted-foreground">
                        Revoked
                      </span>
                    ) : (
                      <Button
                        variant="outline"
                        disabled={action.busy}
                        onClick={() => setSelected(connection)}
                      >
                        Revoke access
                      </Button>
                    )}
                  </div>
                  <p className="break-all text-xs text-muted-foreground">
                    {connection.clientId}
                  </p>
                  <p className="break-all text-sm">
                    {connection.scopes.join(" · ")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Authorized{" "}
                    {new Date(connection.createdAt).toLocaleDateString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {action.error && (
        <p role="alert" className="text-destructive">
          {action.error}
        </p>
      )}
      {selected && (
        <Dialog onClose={() => setSelected(null)} title="Revoke app access">
          <p className="text-sm">
            Revoke every authorization for{" "}
            {selected?.clientName ?? selected?.clientId} made by you in this
            workspace? Existing tokens stop working. Reconnect from the client
            to authorize it again.
          </p>
          <div className="mt-4 flex gap-2">
            <Button
              disabled={action.busy}
              onClick={() => {
                if (!selected) return;
                void action.run(async () => {
                  await productRequest(workspaceId, "connections/revoke", {
                    command: "connection.revoke",
                    input: { clientId: selected.clientId },
                  });
                  setSelected(null);
                  refresh();
                });
              }}
            >
              Revoke access
            </Button>
            <Button
              variant="outline"
              disabled={action.busy}
              onClick={() => setSelected(null)}
            >
              Cancel
            </Button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
