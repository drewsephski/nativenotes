import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductProvider } from "../product-context";
import { NoteDetail } from "../note-detail";
import { MarkdownBody } from "../markdown";
import type { NoteProposal, ProductNote } from "@/lib/product-api";
vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({ data: { user: { id: "user-a" } } }),
  useActiveOrganization: () => ({
    data: {
      name: "Workspace A",
      members: [{ userId: "user-a", user: { name: "Ada" } }],
    },
  }),
}));
let note: ProductNote;
let conflict = false;
let proposal: NoteProposal;
const fetchMock = vi.fn();
function mount() {
  return render(
    <ProductProvider workspaceId="org-a">
      <NoteDetail id="a" />
    </ProductProvider>,
  );
}
beforeEach(() => {
  sessionStorage.clear();
  conflict = false;
  vi.clearAllMocks();
  note = {
    id: "a",
    title: "A real document",
    body: "## Heading\n\nOriginal **content** and [[Related]].",
    summary: "A useful summary",
    folderId: null,
    favorited: false,
    freshness: "needs_review",
    version: 1,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-02T00:00:00Z",
    createdByUserId: "user-a",
    verifiedAt: null,
    archivedAt: null,
    trashedAt: null,
    purgeAfter: null,
    tags: [],
  };
  proposal = {
    id: "proposal-a",
    noteId: "a",
    title: "Reviewed agent title",
    body: "Agent proposed body",
    summary: "Agent summary",
    base: { title: note.title, body: note.body, summary: note.summary },
    expectedVersion: 1,
    reason: "Record verified deployment",
    source: "repo/commit/abc123",
    oauthClientId: "https://agent.example/client.json",
    proposedByUserId: "agent-user",
    status: "pending",
    reviewedByUserId: null,
    reviewedAt: null,
    appliedVersion: null,
    createdAt: note.createdAt,
  };
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (url: URL, init?: RequestInit) => {
    if (init?.method === "POST") {
      const { command, input } = JSON.parse(init.body as string);
      if (command === "proposal.accept" || command === "proposal.reject") {
        proposal = {
          ...proposal,
          status: command === "proposal.accept" ? "accepted" : "rejected",
          reviewedByUserId: "user-a",
          appliedVersion: command === "proposal.accept" ? 2 : null,
        };
        if (command === "proposal.accept")
          note = {
            ...note,
            title: proposal.title,
            body: proposal.body,
            summary: proposal.summary,
            version: 2,
          };
        return Response.json(proposal);
      }
      if (command === "note.update") {
        if (conflict)
          return Response.json(
            {
              error: "version_conflict",
              message: "This note changed elsewhere.",
            },
            { status: 409 },
          );
        note = {
          ...note,
          title: input.title,
          body: input.body,
          summary: input.summary,
          version: note.version + 1,
        };
      }
      if (command === "note.favorite")
        note = { ...note, favorited: input.favorited };
      if (command === "note.confirm")
        note = {
          ...note,
          freshness: "current",
          verifiedAt: "2026-09-26T00:00:00Z",
        };
      if (command === "note.archive")
        note = { ...note, archivedAt: "2026-09-26T00:00:00Z" };
      if (command === "note.trash")
        note = { ...note, trashedAt: "2026-09-26T00:00:00Z" };
      if (command === "note.restore")
        note = { ...note, archivedAt: null, trashedAt: null };
      if (command === "note.restoreRevision")
        note = { ...note, body: "Historical body", version: note.version + 1 };
      if (command === "tag.assign")
        note = { ...note, tags: [{ id: "tag-a", name: "Research" }] };
      if (command === "tag.remove") note = { ...note, tags: [] };
      return Response.json(note);
    }
    if (url.pathname.endsWith("navigation"))
      return Response.json({ folders: [], counts: {}, folderCounts: {} });
    if (url.pathname.endsWith("tags"))
      return Response.json({
        tags: [{ id: "tag-a", name: "Research", noteCount: 0 }],
      });
    if (url.pathname.endsWith("graph"))
      return Response.json({
        nodes: [
          { id: "a", title: note.title },
          { id: "related", title: "Related" },
        ],
        edges: [{ source: "related", target: "a", title: note.title }],
      });
    if (url.pathname.endsWith("proposals"))
      return Response.json({ proposals: [proposal], hasMore: false });
    if (url.pathname.endsWith("proposal")) return Response.json(proposal);
    if (url.pathname.endsWith("history"))
      return Response.json({
        revisions: [
          {
            id: "rev-a",
            version: 1,
            title: note.title,
            body: "Historical body",
            createdAt: note.createdAt,
          },
        ],
      });
    return Response.json(note);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("document interactions", () => {
  it("renders Markdown, summary, provenance, wiki links and backlinks", async () => {
    mount();
    expect(
      await screen.findByRole("heading", { name: "A real document" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Heading" }),
    ).toBeInTheDocument();
    expect(screen.getByText("A useful summary")).toBeInTheDocument();
    expect(screen.getByText("By Ada")).toBeInTheDocument();
    expect(
      (await screen.findAllByRole("link", { name: "Related" }))[0],
    ).toHaveAttribute("href", "/app/notes/related");
    expect(screen.getByText("Linked from")).toBeInTheDocument();
  });
  it("saves versioned edits and supports cancel without mutation", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.type(
      screen.getByRole("textbox", { name: "Note content" }),
      " Draft",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Unsaved");
    await user.click(screen.getByRole("button", { name: "Save", exact: true }));
    await screen.findByRole("button", { name: "Edit" });
    const input = JSON.parse(
      fetchMock.mock.calls.find(([, init]) =>
        init?.body?.includes('"note.update"'),
      )![1].body,
    ).input;
    expect(input.expectedVersion).toBe(1);
    expect(input.body).toContain("Draft");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.type(screen.getByRole("textbox", { name: "Title" }), " discard");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.getByRole("heading", { name: "A real document" }),
    ).toBeInTheDocument();
  });
  it("retains draft on conflict, reloads latest and keeps the old draft for comparison", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.clear(screen.getByRole("textbox", { name: "Note content" }));
    await user.type(
      screen.getByRole("textbox", { name: "Note content" }),
      "My preserved draft",
    );
    conflict = true;
    await user.click(screen.getByRole("button", { name: "Save", exact: true }));
    expect(
      await screen.findByRole("button", { name: "Reload latest" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Note content" })).toHaveValue(
      "My preserved draft",
    );
    note = { ...note, body: "Other author's latest", version: 2 };
    await user.click(screen.getByRole("button", { name: "Reload latest" }));
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Note content" })).toHaveValue(
        "Other author's latest",
      ),
    );
    await user.click(
      screen.getByRole("button", { name: /Preserved draft · version/ }),
    );
    expect(screen.getByText("My preserved draft")).toBeInTheDocument();
    expect(
      sessionStorage.getItem("nativenotes:draft:user-a:org-a:a:recovery"),
    ).toContain("My preserved draft");
  });
  it("preserves unsaved edits across navigation remounts", async () => {
    const user = userEvent.setup();
    const first = mount();
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.type(
      screen.getByRole("textbox", { name: "Title" }),
      " retained",
    );
    first.unmount();
    mount();
    expect(await screen.findByRole("textbox", { name: "Title" })).toHaveValue(
      "A real document retained",
    );
  });
  it("persists favorite, confirmation, tags and reversible lifecycle actions", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByRole("button", { name: "Favorite note" }),
    );
    expect(
      await screen.findByRole("button", { name: "Unfavorite note" }),
    ).toHaveAttribute("aria-pressed", "true");
    await user.click(
      screen.getByRole("button", { name: "Confirm still true" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Note status" }),
      ).toHaveTextContent("Verified"),
    );
    expect(note.version).toBe(1);
    await user.click(screen.getByRole("combobox", { name: "Assign tag" }));
    await user.click(await screen.findByRole("option", { name: "Research" }));
    await user.click(
      await screen.findByRole("button", { name: "Remove tag Research" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Remove tag Research" }),
      ).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Archive note" }));
    await user.click(
      await screen.findByRole("button", { name: "Restore from archive" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Move to trash" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Restore from trash" }),
    );
    expect(
      await screen.findByRole("button", { name: "Archive note" }),
    ).toBeInTheDocument();
  });
  it("inspects and restores history as a new version", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: "History" }));
    await user.click(await screen.findByRole("button", { name: /Version 1/ }));
    await user.click(screen.getByRole("button", { name: "Restore version 1" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Historical body")).toBeInTheDocument();
    expect(note.version).toBe(2);
  });
  it("reviews source and diffs, accepts a proposal and displays the saved content", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByRole("button", { name: "Agent changes" }),
    );
    await user.click(
      await screen.findByRole("button", { name: /Reviewed agent title/ }),
    );
    expect(await screen.findByText("repo/commit/abc123")).toBeInTheDocument();
    expect(
      screen.getByText("https://agent.example/client.json"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Content diff" }),
    ).toHaveTextContent("+ Agent proposed body");
    await user.click(screen.getByRole("button", { name: "Accept and save" }));
    await screen.findByText("accepted · saved as version 2");
    await user.keyboard("{Escape}");
    expect(
      screen.getByRole("heading", { name: "Reviewed agent title" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Agent proposed body")).toBeInTheDocument();
    expect(note.version).toBe(2);
  });
  it("disables acceptance for stale proposals and rejects without changing content", async () => {
    const user = userEvent.setup();
    note = { ...note, version: 2, body: "A newer human edit" };
    mount();
    await user.click(
      await screen.findByRole("button", { name: "Agent changes" }),
    );
    await user.click(
      await screen.findByRole("button", { name: /Reviewed agent title/ }),
    );
    expect(
      await screen.findByRole("button", { name: "Accept and save" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/The note changed after this proposal/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reject proposal" }));
    await screen.findByText("rejected");
    expect(note.body).toBe("A newer human edit");
    expect(
      fetchMock.mock.calls.some(([, init]) =>
        init?.body?.includes('"proposal.accept"'),
      ),
    ).toBe(false);
  });
  it("protects an open draft from proposal acceptance", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.type(
      screen.getByRole("textbox", { name: "Note content" }),
      " local draft",
    );
    await user.click(screen.getByRole("button", { name: "Agent changes" }));
    await user.click(
      await screen.findByRole("button", { name: /Reviewed agent title/ }),
    );
    expect(
      await screen.findByRole("button", { name: "Accept and save" }),
    ).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(
      (
        screen.getByRole("textbox", {
          name: "Note content",
        }) as HTMLTextAreaElement
      ).value,
    ).toContain("local draft");
  });
  it("provides the inspector as a keyboard-dismissable sheet", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByRole("button", { name: "About", exact: true }),
    );
    expect(
      screen.getByRole("dialog", { name: "About this note" }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("does not execute raw HTML or resolve links inside code", () => {
    render(
      <MarkdownBody
        body={"<script>alert(1)</script>\n\n`[[Related]]`\n\n[[Related]]"}
        nodes={[{ id: "related", title: "Related" }]}
      />,
    );
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByText("[[Related]]")).toHaveProperty("tagName", "CODE");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
