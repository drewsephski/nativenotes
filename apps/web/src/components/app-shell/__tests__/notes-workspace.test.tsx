import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUseActiveOrganization = vi.fn();
const mockFetchNotes = vi.fn();
const mockCreateNote = vi.fn();
const mockUpdateNote = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  useActiveOrganization: () => mockUseActiveOrganization(),
}));

vi.mock("@/lib/notes-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/notes-api")>(
    "@/lib/notes-api",
  );
  return {
    ...actual,
    fetchNotes: (...args: unknown[]) => mockFetchNotes(...args),
    createNote: (...args: unknown[]) => mockCreateNote(...args),
    updateNote: (...args: unknown[]) => mockUpdateNote(...args),
  };
});

import { NotesWorkspace } from "@/components/app-shell/notes-workspace";
import { NotesApiError } from "@/lib/notes-api";

const noteA = {
  id: "note_a",
  title: "Alpha note",
  body: "Body for alpha",
  version: 1,
  createdAt: "2026-09-20T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
};

const noteB = {
  id: "note_b",
  title: "Bravo note",
  body: "Body for bravo",
  version: 1,
  createdAt: "2026-09-21T00:00:00.000Z",
  updatedAt: "2026-09-21T00:00:00.000Z",
};

const noteCreated = {
  id: "note_created",
  title: "Fresh note",
  body: "Created body",
  version: 1,
  createdAt: "2026-09-26T12:00:00.000Z",
  updatedAt: "2026-09-26T12:00:00.000Z",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("NotesWorkspace real notes loading", () => {
  beforeEach(() => {
    mockUseActiveOrganization.mockReturnValue({
      data: { id: "org_a", name: "Workspace A" },
      isPending: false,
    });
  });

  test("shows loading skeleton while fetching", () => {
    mockFetchNotes.mockReturnValue(new Promise(() => undefined));
    render(<NotesWorkspace />);
    expect(screen.getByLabelText(/loading notes/i)).toBeInTheDocument();
  });

  test("shows empty state when API returns no notes", async () => {
    mockFetchNotes.mockResolvedValue([]);
    render(<NotesWorkspace />);
    expect(await screen.findByText("No notes yet.")).toBeInTheDocument();
    expect(
      screen.getByText("Your notes will appear here."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^create note$/i }),
    ).toBeInTheDocument();
  });

  test("shows error with retry", async () => {
    const user = userEvent.setup();
    mockFetchNotes.mockRejectedValue(
      new NotesApiError("unknown", "Could not load notes.", 500),
    );
    render(<NotesWorkspace />);
    expect(await screen.findByText("Could not load notes.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();

    mockFetchNotes.mockResolvedValue([noteA]);
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByDisplayValue("Alpha note")).toBeInTheDocument();
  });

  test("renders real notes and selects first by default", async () => {
    mockFetchNotes.mockResolvedValue([noteA, noteB]);
    render(<NotesWorkspace />);
    expect(
      await screen.findByRole("option", { name: /alpha note/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /bravo note/i }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Alpha note")).toBeInTheDocument();
    expect(screen.getByLabelText("Note content")).toHaveValue("Body for alpha");
  });

  test("selecting a note resets the draft to that note", async () => {
    const user = userEvent.setup();
    mockFetchNotes.mockResolvedValue([noteA, noteB]);
    render(<NotesWorkspace />);
    await screen.findByRole("option", { name: /alpha note/i });
    await user.clear(screen.getByLabelText(/^title$/i));
    await user.type(screen.getByLabelText(/^title$/i), "Dirty alpha");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: /bravo note/i }));
    expect(screen.getByDisplayValue("Bravo note")).toBeInTheDocument();
    expect(screen.getByLabelText("Note content")).toHaveValue("Body for bravo");
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  test("workspace change clears previous notes before refetch", async () => {
    let resolveA: ((value: typeof noteA[]) => void) | undefined;
    mockFetchNotes.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveA = resolve as (value: typeof noteA[]) => void;
        }),
    );

    const { rerender } = render(<NotesWorkspace />);
    expect(screen.getByLabelText(/loading notes/i)).toBeInTheDocument();
    resolveA?.([noteA]);
    expect(await screen.findByDisplayValue("Alpha note")).toBeInTheDocument();

    let resolveB: ((value: typeof noteB[]) => void) | undefined;
    mockFetchNotes.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveB = resolve as (value: typeof noteB[]) => void;
        }),
    );
    mockUseActiveOrganization.mockReturnValue({
      data: { id: "org_b", name: "Workspace B" },
      isPending: false,
    });
    rerender(<NotesWorkspace />);

    await waitFor(() => {
      expect(screen.queryByDisplayValue("Alpha note")).not.toBeInTheDocument();
      expect(screen.getByLabelText(/loading notes/i)).toBeInTheDocument();
    });

    resolveB?.([noteB]);
    expect(await screen.findByDisplayValue("Bravo note")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Alpha note")).not.toBeInTheDocument();
  });
});

describe("NotesWorkspace note creation", () => {
  beforeEach(() => {
    mockUseActiveOrganization.mockReturnValue({
      data: { id: "org_a", name: "Workspace A" },
      isPending: false,
    });
    mockFetchNotes.mockResolvedValue([]);
  });

  test("New note opens the create dialog", async () => {
    const user = userEvent.setup();
    render(<NotesWorkspace />);
    await screen.findByText("No notes yet.");
    await user.click(screen.getByRole("button", { name: /new note/i }));
    expect(screen.getByRole("dialog", { name: /new note/i })).toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog")).getByLabelText(/^title$/i),
    ).toBeInTheDocument();
  });

  test("empty-state Create note opens the same dialog", async () => {
    const user = userEvent.setup();
    render(<NotesWorkspace />);
    await screen.findByText("No notes yet.");
    await user.click(screen.getByRole("button", { name: /^create note$/i }));
    expect(screen.getByRole("dialog", { name: /new note/i })).toBeInTheDocument();
  });

  test("validation prevents empty title", async () => {
    const user = userEvent.setup();
    render(<NotesWorkspace />);
    await screen.findByText("No notes yet.");
    await user.click(screen.getByRole("button", { name: /new note/i }));
    const dialog = screen.getByRole("dialog", { name: /new note/i });
    await user.click(
      within(dialog).getByRole("button", { name: /^create note$/i }),
    );
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Title is required",
    );
    expect(mockCreateNote).not.toHaveBeenCalled();
  });

  test("successful create closes dialog and selects the new note", async () => {
    const user = userEvent.setup();
    mockCreateNote.mockResolvedValue(noteCreated);
    mockFetchNotes
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([noteCreated]);

    render(<NotesWorkspace />);
    await screen.findByText("No notes yet.");
    await user.click(screen.getByRole("button", { name: /new note/i }));
    const dialog = screen.getByRole("dialog", { name: /new note/i });
    await user.type(within(dialog).getByLabelText(/^title$/i), "Fresh note");
    await user.type(within(dialog).getByLabelText(/body/i), "Created body");
    await user.click(
      within(dialog).getByRole("button", { name: /^create note$/i }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(await screen.findByDisplayValue("Fresh note")).toBeInTheDocument();
    expect(screen.getByLabelText("Note content")).toHaveValue("Created body");
    expect(mockCreateNote).toHaveBeenCalledWith({
      title: "Fresh note",
      body: "Created body",
    });
  });

  test("API error renders inline and keeps dialog open", async () => {
    const user = userEvent.setup();
    mockCreateNote.mockRejectedValue(
      new NotesApiError("unknown", "Could not create note.", 500),
    );

    render(<NotesWorkspace />);
    await screen.findByText("No notes yet.");
    await user.click(screen.getByRole("button", { name: /new note/i }));
    const dialog = screen.getByRole("dialog", { name: /new note/i });
    await user.type(within(dialog).getByLabelText(/^title$/i), "Will fail");
    await user.click(
      within(dialog).getByRole("button", { name: /^create note$/i }),
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Could not create note.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  test("create button shows pending state", async () => {
    const user = userEvent.setup();
    let resolveCreate: ((value: typeof noteCreated) => void) | undefined;
    mockCreateNote.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );

    render(<NotesWorkspace />);
    await screen.findByText("No notes yet.");
    await user.click(screen.getByRole("button", { name: /new note/i }));
    const dialog = screen.getByRole("dialog", { name: /new note/i });
    await user.type(within(dialog).getByLabelText(/^title$/i), "Pending");
    await user.click(
      within(dialog).getByRole("button", { name: /^create note$/i }),
    );

    expect(
      await within(dialog).findByRole("button", { name: /creating/i }),
    ).toBeDisabled();

    mockFetchNotes.mockResolvedValue([noteCreated]);
    resolveCreate?.(noteCreated);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  test("workspace switch during create does not leak previous workspace notes", async () => {
    const user = userEvent.setup();
    let resolveCreate: ((value: typeof noteCreated) => void) | undefined;
    mockCreateNote.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );

    const { rerender } = render(<NotesWorkspace />);
    await screen.findByText("No notes yet.");
    await user.click(screen.getByRole("button", { name: /new note/i }));
    const dialog = screen.getByRole("dialog", { name: /new note/i });
    await user.type(within(dialog).getByLabelText(/^title$/i), "Stale");
    await user.click(
      within(dialog).getByRole("button", { name: /^create note$/i }),
    );
    expect(
      await within(dialog).findByRole("button", { name: /creating/i }),
    ).toBeDisabled();

    mockFetchNotes.mockResolvedValue([noteB]);
    mockUseActiveOrganization.mockReturnValue({
      data: { id: "org_b", name: "Workspace B" },
      isPending: false,
    });
    rerender(<NotesWorkspace />);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByLabelText(/loading notes/i)).toBeInTheDocument();
    });

    resolveCreate?.(noteCreated);

    expect(await screen.findByDisplayValue("Bravo note")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Fresh note")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("Stale")).not.toBeInTheDocument();
  });
});

describe("NotesWorkspace note editing", () => {
  beforeEach(() => {
    mockUseActiveOrganization.mockReturnValue({
      data: { id: "org_a", name: "Workspace A" },
      isPending: false,
    });
    mockFetchNotes.mockResolvedValue([noteA, noteB]);
  });

  test("editing marks dirty and Save sends expectedVersion", async () => {
    const user = userEvent.setup();
    mockUpdateNote.mockResolvedValue({
      ...noteA,
      title: "Alpha edited",
      body: "Body for alpha edited",
      version: 2,
      updatedAt: "2026-09-26T13:00:00.000Z",
    });

    render(<NotesWorkspace />);
    await screen.findByDisplayValue("Alpha note");
    expect(screen.getByText("Saved")).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/^title$/i));
    await user.type(screen.getByLabelText(/^title$/i), "Alpha edited");
    await user.clear(screen.getByLabelText("Note content"));
    await user.type(screen.getByLabelText("Note content"), "Body for alpha edited");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /save note/i }));

    await waitFor(() => {
      expect(mockUpdateNote).toHaveBeenCalledWith({
        id: "note_a",
        title: "Alpha edited",
        body: "Body for alpha edited",
        expectedVersion: 1,
      });
    });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Alpha edited")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /alpha edited/i }),
    ).toBeInTheDocument();
  });

  test("Save is disabled while pending", async () => {
    const user = userEvent.setup();
    let resolveUpdate: ((value: typeof noteA) => void) | undefined;
    mockUpdateNote.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
    );

    render(<NotesWorkspace />);
    await screen.findByDisplayValue("Alpha note");
    await user.type(screen.getByLabelText(/^title$/i), "!");
    await user.click(screen.getByRole("button", { name: /save note/i }));

    expect(
      await screen.findByRole("button", { name: /save note/i }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: /save note/i })).toHaveTextContent(
      "Saving…",
    );

    resolveUpdate?.({
      ...noteA,
      title: "Alpha note!",
      version: 2,
      updatedAt: "2026-09-26T13:00:00.000Z",
    });
    await waitFor(() => {
      expect(screen.getByText("Saved")).toBeInTheDocument();
    });
  });

  test("409 shows conflict UI; Reload latest replaces draft", async () => {
    const user = userEvent.setup();
    mockUpdateNote.mockRejectedValue(
      new NotesApiError(
        "version_conflict",
        "This note changed somewhere else.",
        409,
        3,
      ),
    );

    render(<NotesWorkspace />);
    await screen.findByDisplayValue("Alpha note");
    await user.type(screen.getByLabelText(/^title$/i), " local");
    await user.click(screen.getByRole("button", { name: /save note/i }));

    expect(
      await screen.findByText("This note changed somewhere else."),
    ).toBeInTheDocument();
    expect(screen.getByText("Conflict")).toBeInTheDocument();

    const serverLatest = {
      ...noteA,
      title: "Server wins",
      body: "Server body",
      version: 3,
      updatedAt: "2026-09-26T14:00:00.000Z",
    };
    mockFetchNotes.mockResolvedValue([serverLatest, noteB]);
    await user.click(screen.getByRole("button", { name: /reload latest/i }));

    expect(await screen.findByDisplayValue("Server wins")).toBeInTheDocument();
    expect(screen.getByLabelText("Note content")).toHaveValue("Server body");
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  test("Keep my draft preserves local text", async () => {
    const user = userEvent.setup();
    mockUpdateNote.mockRejectedValue(
      new NotesApiError(
        "version_conflict",
        "This note changed somewhere else.",
        409,
        3,
      ),
    );

    render(<NotesWorkspace />);
    await screen.findByDisplayValue("Alpha note");
    await user.clear(screen.getByLabelText(/^title$/i));
    await user.type(screen.getByLabelText(/^title$/i), "My draft title");
    await user.click(screen.getByRole("button", { name: /save note/i }));

    expect(
      await screen.findByText("This note changed somewhere else."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /keep my draft/i }));
    expect(screen.getByDisplayValue("My draft title")).toBeInTheDocument();
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(mockFetchNotes).toHaveBeenCalledTimes(1);
  });
});
