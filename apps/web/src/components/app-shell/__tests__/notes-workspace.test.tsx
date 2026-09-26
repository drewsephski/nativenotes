import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductProvider } from "../product-context";
import { NotesWorkspace } from "../notes-workspace";
import { FolderTree } from "../folder-tree";
import { SearchDialog } from "../search-dialog";
import { TagsPage } from "../tags-page";
import { InstructionsEditor } from "../instructions-editor";
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/app",
}));
const note = {
  id: "note-a",
  title: "Research notes",
  body: "Useful knowledge",
  summary: null,
  folderId: null,
  favorited: true,
  freshness: "current",
  version: 1,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
};
const fetchMock = vi.fn();
function wrap(children: React.ReactNode, workspaceId = "org-a") {
  return (
    <ProductProvider key={workspaceId} workspaceId={workspaceId}>
      {children}
    </ProductProvider>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (url: URL, init?: RequestInit) => {
    if (init?.method === "POST") return Response.json(note);
    if (url.pathname.endsWith("navigation"))
      return Response.json({
        folders: [],
        counts: { all: 1, inbox: 1, favorites: 1, archive: 0, trash: 0 },
        folderCounts: {},
      });
    if (url.pathname.endsWith("tags"))
      return Response.json({
        tags: [{ id: "tag-a", name: "Research", noteCount: 1 }],
      });
    if (url.pathname.endsWith("instructions"))
      return Response.json({
        chain: [
          {
            folderId: null,
            name: "Workspace",
            scopeType: "workspace",
            instructions: "Be precise",
          },
        ],
      });
    return Response.json({ notes: [note], hasMore: false });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("persisted workspace navigation", () => {
  it("loads notes with an explicit workspace precondition and links to documents", async () => {
    render(wrap(<NotesWorkspace />));
    expect(
      await screen.findByRole("link", { name: /Research notes/ }),
    ).toHaveAttribute("href", "/app/notes/note-a");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        headers: expect.objectContaining({ "x-workspace-id": "org-a" }),
      }),
    );
  });
  it("uses backend lifecycle filters", async () => {
    render(wrap(<NotesWorkspace title="Trash" view="trash" />));
    await screen.findByText("Research notes");
    expect(
      fetchMock.mock.calls.some(
        ([url]) => (url as URL).searchParams.get("view") === "trash",
      ),
    ).toBe(true);
    expect(
      screen.getByText(/automatic permanent deletion is not enabled/),
    ).toBeInTheDocument();
  });
  it("discards previous workspace content immediately while the new request waits", async () => {
    const { rerender } = render(wrap(<NotesWorkspace />));
    await screen.findByText("Research notes");
    fetchMock.mockImplementation(() => new Promise(() => {}));
    rerender(wrap(<NotesWorkspace />, "org-b"));
    expect(screen.queryByText("Research notes")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading notes");
  });
  it("creates a note through the real command boundary and opens the result", async () => {
    const user = userEvent.setup();
    render(wrap(<NotesWorkspace />));
    await user.click(screen.getByRole("button", { name: "New note" }));
    await user.type(
      screen.getByRole("textbox", { name: "Title" }),
      "New knowledge",
    );
    await user.click(screen.getByRole("button", { name: "Create note" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/notes/note-a"));
    const write = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "POST",
    );
    expect(JSON.parse(write![1].body)).toEqual({
      command: "note.create",
      input: { title: "New knowledge", body: "" },
    });
  });
  it("surfaces load failures with a retry", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json(
        { error: "forbidden", message: "Membership removed" },
        { status: 403 },
      ),
    );
    render(wrap(<NotesWorkspace />));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Membership removed",
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
  it("expands and collapses actual nested folders with direct counts", async () => {
    const user = userEvent.setup();
    render(
      <FolderTree
        folders={[
          {
            id: "a",
            parentId: null,
            name: "Projects",
            position: 0,
            archivedAt: null,
          },
          {
            id: "b",
            parentId: "a",
            name: "Research",
            position: 0,
            archivedAt: null,
          },
        ]}
        counts={{ a: 2, b: 3 }}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Research, 3 notes" }),
    ).toHaveAttribute("href", "/app/folders/b");
    await user.click(screen.getByRole("button", { name: "Collapse Projects" }));
    expect(
      screen.queryByRole("link", { name: "Research, 3 notes" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand Projects" }));
    expect(
      screen.getByRole("link", { name: "Research, 3 notes" }),
    ).toBeInTheDocument();
  });
  it("opens search with Ctrl+K and closes with Escape", async () => {
    const user = userEvent.setup();
    render(wrap(<SearchDialog />));
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(
      screen.getByRole("dialog", { name: "Search notes" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: /Research notes/ }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("shows real tag counts and persists instructions", async () => {
    const user = userEvent.setup();
    render(
      wrap(
        <>
          <TagsPage />
          <InstructionsEditor />
        </>,
      ),
    );
    expect(
      await screen.findByRole("link", { name: /Research.*1 notes/ }),
    ).toHaveAttribute("href", "/app/tags/tag-a");
    const editor = await screen.findByRole("textbox", { name: "Instructions" });
    expect(editor).toHaveValue("Be precise");
    await user.type(editor, ". Cite sources.");
    await user.click(screen.getByRole("button", { name: "Save instructions" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Saved"),
    );
    expect(
      fetchMock.mock.calls.some(([, init]) =>
        init?.body?.includes('"command":"instructions.set"'),
      ),
    ).toBe(true);
  });
});
