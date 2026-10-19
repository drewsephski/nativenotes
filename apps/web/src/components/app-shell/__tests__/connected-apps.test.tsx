import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductProvider } from "../product-context";
import { ConnectedApps } from "../connected-apps";
const fetchMock = vi.fn();
let revoked = false;
let canManage = true;
beforeEach(() => {
  revoked = false;
  canManage = true;
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: URL, init?: RequestInit) => {
    if (init?.method === "POST") {
      revoked = true;
      return Response.json({ revoked: true });
    }
    if (url.pathname.endsWith("connections"))
      return Response.json({
        connections: [
          {
            id: "grant",
            clientId: "client-a",
            clientName: "QA client",
            scopes: ["mcp:read", "mcp:write"],
            createdAt: "2026-10-19T00:00:00Z",
            revokedAt: revoked ? "2026-10-19T01:00:00Z" : null,
          },
        ],
        policy: { requireReview: false },
        canManagePolicy: canManage,
      });
    return Response.json({ folders: [], counts: {}, folderCounts: {} });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const view = () =>
  render(
    <ProductProvider workspaceId="org-a">
      <ConnectedApps />
    </ProductProvider>,
  );
describe("Connected apps", () => {
  it("shows real grant permissions and requires confirmation before revoking", async () => {
    const user = userEvent.setup();
    view();
    expect(await screen.findByText("QA client")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Revoke access" }));
    const dialog = screen.getByRole("dialog", { name: "Revoke app access" });
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(0);
    await user.click(
      within(dialog).getByRole("button", { name: "Revoke access" }),
    );
    expect(await screen.findByText("Revoked")).toBeInTheDocument();
    const mutation = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "POST",
    )!;
    expect(mutation[0].pathname).toBe("/api/workspace/connections/revoke");
    expect(mutation[1].headers["x-workspace-id"]).toBe("org-a");
    expect(JSON.parse(mutation[1].body).input).toEqual({
      clientId: "client-a",
    });
  });
  it("restricts policy editing to managers and shows server failures", async () => {
    canManage = false;
    view();
    expect(await screen.findByRole("checkbox")).toBeDisabled();
    fetchMock.mockImplementation(async () =>
      Response.json(
        { message: "Connections unavailable", error: "unavailable" },
        { status: 503 },
      ),
    );
    cleanup();
    view();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Connections unavailable",
      ),
    );
  });
});
