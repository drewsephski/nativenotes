import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductProvider } from "../product-context";
import { FolderForm } from "../folder-settings";
import { TagsPage } from "../tags-page";
import { GraphPage } from "../graph-page";
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const fetchMock = vi.fn();
const folders = [
  { id: "root", parentId: null, name: "Root", position: 0, archivedAt: null },
  {
    id: "child",
    parentId: "root",
    name: "Child",
    position: 1,
    archivedAt: null,
  },
  { id: "other", parentId: null, name: "Other", position: 2, archivedAt: null },
];
const wrap = (element: React.ReactNode) => (
  <ProductProvider workspaceId="org-a">{element}</ProductProvider>
);
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (url: URL, init?: RequestInit) => {
    if (init?.method === "POST")
      return Response.json({ id: "new-folder", ok: true });
    if (url.pathname.endsWith("navigation"))
      return Response.json({ folders, counts: {}, folderCounts: {} });
    if (url.pathname.endsWith("tags"))
      return Response.json({
        tags: [
          { id: "a", name: "Source", noteCount: 2 },
          { id: "b", name: "Destination", noteCount: 1 },
        ],
      });
    return Response.json({
      nodes: [
        { id: "a", title: "First" },
        { id: "b", title: "Second" },
      ],
      edges: [{ source: "a", target: "b", title: "Second" }],
    });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mutation(name: string) {
  return fetchMock.mock.calls.find(([, init]) =>
    init?.body?.includes(`"command":"${name}"`),
  );
}
async function chooseOption(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  option: string,
) {
  await user.click(screen.getByRole("combobox", { name: label }));
  await user.click(
    await screen.findByRole("option", { name: option, exact: true }),
  );
}
describe("organization tools", () => {
  it("creates a nested folder with stable position", async () => {
    const user = userEvent.setup();
    render(wrap(<FolderForm />));
    await chooseOption(user, "Parent folder", "Root");
    await user.type(
      screen.getByRole("textbox", { name: "Folder name" }),
      "New child",
    );
    await user.click(screen.getByRole("button", { name: "Create folder" }));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/app/folders/new-folder"),
    );
    expect(JSON.parse(mutation("folder.create")![1].body).input).toEqual({
      name: "New child",
      parentId: "root",
      position: 0,
    });
  });
  it("excludes itself and descendants as parents, while permitting a move to another root", async () => {
    const user = userEvent.setup();
    render(wrap(<FolderForm folder={folders[0]} />));
    await user.click(screen.getByRole("combobox", { name: "Parent folder" }));
    expect(
      screen.queryByRole("option", { name: "Root", exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Child", exact: true }),
    ).not.toBeInTheDocument();
    await user.click(
      await screen.findByRole("option", { name: "Other", exact: true }),
    );
    await user.click(screen.getByRole("button", { name: "Save folder" }));
    await waitFor(() => expect(mutation("folder.update")).toBeTruthy());
    expect(JSON.parse(mutation("folder.update")![1].body).input.parentId).toBe(
      "other",
    );
  });
  it("merges tags through an explicit destination", async () => {
    const user = userEvent.setup();
    render(wrap(<TagsPage />));
    await user.click(
      (await screen.findAllByRole("button", { name: "Manage" }))[0],
    );
    await chooseOption(user, "Merge into", "Destination");
    await user.click(screen.getByRole("button", { name: "Merge tag" }));
    await waitFor(() => expect(mutation("tag.merge")).toBeTruthy());
    expect(JSON.parse(mutation("tag.merge")![1].body).input).toEqual({
      id: "a",
      intoId: "b",
    });
  });
  it("requires explicit confirmation before deleting a tag", async () => {
    const user = userEvent.setup();
    render(wrap(<TagsPage />));
    await user.click(
      (await screen.findAllByRole("button", { name: "Manage" }))[0],
    );
    await user.click(screen.getByRole("button", { name: "Delete tag" }));
    expect(mutation("tag.delete")).toBeUndefined();
    await user.click(
      screen.getByRole("button", { name: "Confirm delete tag" }),
    );
    await waitFor(() => expect(mutation("tag.delete")).toBeTruthy());
  });
  it("shows real graph links and filters nodes", async () => {
    const user = userEvent.setup();
    render(wrap(<GraphPage />));
    expect(
      await screen.findByRole("link", { name: "First", exact: true }),
    ).toHaveAttribute("href", "/app/notes/a");
    await user.type(
      screen.getByRole("textbox", { name: "Filter graph" }),
      "Second",
    );
    expect(
      screen.queryByRole("link", { name: "First", exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Second", exact: true }),
    ).toHaveAttribute("href", "/app/notes/b");
  });
});
