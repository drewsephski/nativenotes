import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUseSession = vi.fn();
const mockUseListOrganizations = vi.fn();
const mockUseActiveOrganization = vi.fn();
const mockSetActive = vi.fn();
const mockCreate = vi.fn();
const mockSignOut = vi.fn();
const mockRefetchOrgs = vi.fn();
const mockRefetchActive = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  useSession: () => mockUseSession(),
  useListOrganizations: () => mockUseListOrganizations(),
  useActiveOrganization: () => mockUseActiveOrganization(),
  signOut: (...args: unknown[]) => mockSignOut(...args),
  authClient: {
    organization: {
      setActive: (...args: unknown[]) => mockSetActive(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

vi.mock("@/lib/config", () => ({
  getSignInUrl: () =>
    "http://localhost:3000/sign-in?callbackURL=http%3A%2F%2Flocalhost%3A3001%2Fapp",
  getNativeNotesApiUrl: () => "http://localhost:3000",
  getWebOrigin: () => "http://localhost:3001",
}));

import { AuthGate } from "@/components/app-shell/auth-gate";
import { AccountMenu } from "@/components/app-shell/account-menu";
import { WorkspaceSelector } from "@/components/app-shell/workspace-selector";
import { WorkspaceOnboarding } from "@/components/app-shell/workspace-onboarding";
import { AppShell } from "@/components/app-shell/app-shell";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("auth session gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefetchOrgs.mockResolvedValue(undefined);
    mockRefetchActive.mockResolvedValue(undefined);
  });

  test("unauthenticated state redirects toward backend sign-in", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });

    mockUseSession.mockReturnValue({
      data: null,
      isPending: false,
      error: null,
    });

    render(
      <AuthGate>
        <div>App content</div>
      </AuthGate>,
    );

    expect(screen.getByText(/redirecting to sign in/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith(expect.stringContaining("/sign-in"));
    });
  });

  test("authenticated user renders account identity", () => {
    mockUseSession.mockReturnValue({
      data: {
        user: {
          name: "Ada Lovelace",
          email: "ada@example.com",
          image: null,
        },
      },
      isPending: false,
      error: null,
    });

    render(<AccountMenu />);

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
  });
});

describe("workspace selector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseListOrganizations.mockReturnValue({
      data: [
        { id: "org_1", name: "Personal", slug: "personal" },
        { id: "org_2", name: "NativeNotes Team", slug: "nativenotes-team" },
      ],
      isPending: false,
      error: null,
      refetch: mockRefetchOrgs,
    });
    mockUseActiveOrganization.mockReturnValue({
      data: { id: "org_1", name: "Personal", slug: "personal" },
      isPending: false,
      error: null,
      refetch: mockRefetchActive,
    });
    mockSetActive.mockResolvedValue({ data: {}, error: null });
  });

  test("shows organizations with active checkmark affordance", async () => {
    const user = userEvent.setup();
    render(<WorkspaceSelector />);

    expect(screen.getByLabelText("Workspace: Personal")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Workspace: Personal"));
    expect(screen.getByText("NativeNotes Team")).toBeInTheDocument();
  });

  test("switching active org calls setActive", async () => {
    const user = userEvent.setup();
    render(<WorkspaceSelector />);

    const trigger = screen.getByRole("button", { name: "Workspace: Personal" });
    await user.click(trigger);
    await user.click(
      await screen.findByRole("menuitem", { name: /NativeNotes Team/i }),
    );

    await waitFor(() => {
      expect(mockSetActive).toHaveBeenCalledWith({
        organizationId: "org_2",
      });
    });
  });

  test("workspace creation closes the menu and exposes a keyboard-accessible dialog", async () => {
    mockCreate.mockResolvedValue({ data: { id: "org_qa" }, error: null });
    const user = userEvent.setup();
    render(<WorkspaceSelector />);
    await user.click(
      screen.getByRole("button", { name: "Workspace: Personal" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Create workspace" }),
    );
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Create workspace" }),
    ).toBeInTheDocument();
    await user.type(
      screen.getByRole("textbox", { name: "Workspace name" }),
      "Parity QA",
    );
    await user.click(
      screen.getByRole("button", { name: "Create", exact: true }),
    );
    await waitFor(() =>
      expect(mockSetActive).toHaveBeenCalledWith({ organizationId: "org_qa" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  test("a fresh session can select its first workspace", async () => {
    mockUseActiveOrganization.mockReturnValue({
      data: null,
      isPending: false,
      error: null,
      refetch: mockRefetchActive,
    });
    const user = userEvent.setup();
    render(<WorkspaceSelector />);

    await user.click(
      screen.getByRole("button", { name: "Workspace: Select workspace" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Personal" }));

    await waitFor(() => {
      expect(mockSetActive).toHaveBeenCalledWith({ organizationId: "org_1" });
      expect(mockRefetchActive).toHaveBeenCalled();
    });
  });
});

describe("zero-org onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({
      data: {
        user: { name: "Ada Lovelace", email: "ada@example.com", image: null },
      },
      isPending: false,
      error: null,
    });
    mockUseListOrganizations.mockReturnValue({
      data: [],
      isPending: false,
      error: null,
      refetch: mockRefetchOrgs,
    });
    mockUseActiveOrganization.mockReturnValue({
      data: null,
      isPending: false,
      error: null,
      refetch: mockRefetchActive,
    });
    mockCreate.mockResolvedValue({
      data: { id: "org_new", name: "Ada's Workspace", slug: "adas-workspace" },
      error: null,
    });
    mockSetActive.mockResolvedValue({ data: {}, error: null });
  });

  test("app shell shows create-first-workspace when user has no orgs", () => {
    render(
      <AppShell>
        <div>notes</div>
      </AppShell>,
    );

    expect(
      screen.getByRole("heading", { name: /create your first workspace/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("notes")).not.toBeInTheDocument();
  });

  test("onboarding form creates and activates organization", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    render(<WorkspaceOnboarding onCreated={onCreated} />);

    expect(
      screen.getByRole("textbox", { name: /workspace name/i }),
    ).toHaveValue("Ada's Workspace");

    await user.click(
      screen.getByRole("button", { name: /^create workspace$/i }),
    );

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled();
      expect(mockSetActive).toHaveBeenCalledWith({
        organizationId: "org_new",
      });
      expect(onCreated).toHaveBeenCalled();
    });
  });
});
