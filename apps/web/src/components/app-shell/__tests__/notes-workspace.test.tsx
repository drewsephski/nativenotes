import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUseActiveOrganization = vi.fn();
const mockFetchNotes = vi.fn();

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
  };
});

import { NotesWorkspace } from "@/components/app-shell/notes-workspace";
import { NotesApiError } from "@/lib/notes-api";

const noteA = {
  id: "note_a",
  title: "Alpha note",
  body: "Body for alpha",
  createdAt: "2026-09-20T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
};

const noteB = {
  id: "note_b",
  title: "Bravo note",
  body: "Body for bravo",
  createdAt: "2026-09-21T00:00:00.000Z",
  updatedAt: "2026-09-21T00:00:00.000Z",
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
    expect(
      await screen.findByRole("heading", { name: "Alpha note" }),
    ).toBeInTheDocument();
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
    expect(
      screen.getByRole("heading", { name: "Alpha note" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Note content")).toHaveTextContent(
      "Body for alpha",
    );
  });

  test("selecting a note updates the read-only preview", async () => {
    const user = userEvent.setup();
    mockFetchNotes.mockResolvedValue([noteA, noteB]);
    render(<NotesWorkspace />);
    await screen.findByRole("option", { name: /alpha note/i });
    await user.click(screen.getByRole("option", { name: /bravo note/i }));
    expect(
      screen.getByRole("heading", { name: "Bravo note" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Note content")).toHaveTextContent(
      "Body for bravo",
    );
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
    expect(
      await screen.findByRole("heading", { name: "Alpha note" }),
    ).toBeInTheDocument();

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
      expect(
        screen.queryByRole("heading", { name: "Alpha note" }),
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText(/loading notes/i)).toBeInTheDocument();
    });

    resolveB?.([noteB]);
    expect(
      await screen.findByRole("heading", { name: "Bravo note" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Alpha note" }),
    ).not.toBeInTheDocument();
  });
});
