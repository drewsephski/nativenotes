import { describe, expect, it, vi, beforeEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";

const mockGetSession = vi.fn();
const mockFindOne = vi.fn();
const mockListByTenant = vi.fn();

vi.mock("../src/auth/auth.js", () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
    $context: Promise.resolve({
      adapter: {
        findOne: (...args: unknown[]) => mockFindOne(...args),
      },
    }),
  },
}));

vi.mock("../src/repositories/note-repository.js", () => ({
  noteRepository: {
    listByTenant: (...args: unknown[]) => mockListByTenant(...args),
  },
}));

vi.mock("better-auth/node", () => ({
  fromNodeHeaders: () => new Headers({ cookie: "session=test" }),
}));

const { handleNotesRoute } = await import("../src/server/notes-route.js");

function fakeRequest(url = "/api/notes"): IncomingMessage {
  return {
    method: "GET",
    url,
    headers: { cookie: "session=test" },
  } as IncomingMessage;
}

function fakeResponse() {
  const state = {
    statusCode: 0,
    body: "" as string,
    headers: {} as Record<string, string>,
  };
  const response = {
    writeHead: (status: number, headers?: Record<string, string>) => {
      state.statusCode = status;
      state.headers = headers ?? {};
    },
    end: (chunk?: string) => {
      state.body = chunk ?? "";
    },
  } as unknown as ServerResponse;
  return { response, state };
}

describe("handleNotesRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListByTenant.mockResolvedValue([
      {
        id: "note-a",
        tenantId: "org-a",
        title: "Scoped note",
        body: "body",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { response, state } = fakeResponse();
    await handleNotesRoute(fakeRequest(), response);
    expect(state.statusCode).toBe(401);
    expect(JSON.parse(state.body)).toEqual({ error: "unauthorized" });
    expect(mockListByTenant).not.toHaveBeenCalled();
  });

  it("returns 409 when no active organization", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-a" },
      session: { activeOrganizationId: null },
    });
    const { response, state } = fakeResponse();
    await handleNotesRoute(fakeRequest(), response);
    expect(state.statusCode).toBe(409);
    expect(JSON.parse(state.body)).toEqual({ error: "no_active_workspace" });
    expect(mockListByTenant).not.toHaveBeenCalled();
  });

  it("returns notes for the session active organization", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-a" },
      session: { activeOrganizationId: "org-a" },
    });
    mockFindOne.mockResolvedValue({
      id: "member-a",
      userId: "user-a",
      organizationId: "org-a",
      role: "owner",
    });

    const { response, state } = fakeResponse();
    await handleNotesRoute(fakeRequest(), response);

    expect(state.statusCode).toBe(200);
    expect(JSON.parse(state.body)).toEqual({
      notes: [
        {
          id: "note-a",
          title: "Scoped note",
          body: "body",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    expect(mockListByTenant).toHaveBeenCalledWith("org-a");
  });

  it("ignores tenantId query and still uses session org", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-a" },
      session: { activeOrganizationId: "org-a" },
    });
    mockFindOne.mockResolvedValue({
      id: "member-a",
      userId: "user-a",
      organizationId: "org-a",
      role: "owner",
    });

    const { response, state } = fakeResponse();
    await handleNotesRoute(
      fakeRequest("/api/notes?tenantId=org-b"),
      response,
    );

    expect(state.statusCode).toBe(200);
    expect(mockListByTenant).toHaveBeenCalledWith("org-a");
    expect(mockListByTenant).not.toHaveBeenCalledWith("org-b");
  });

  it("returns 403 when membership is missing", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-a" },
      session: { activeOrganizationId: "org-a" },
    });
    mockFindOne.mockResolvedValue(null);

    const { response, state } = fakeResponse();
    await handleNotesRoute(fakeRequest(), response);

    expect(state.statusCode).toBe(403);
    expect(JSON.parse(state.body)).toEqual({ error: "forbidden" });
    expect(mockListByTenant).not.toHaveBeenCalled();
  });

  it("active org A cannot list org B notes", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-a" },
      session: { activeOrganizationId: "org-a" },
    });
    mockFindOne.mockResolvedValue({
      id: "member-a",
      userId: "user-a",
      organizationId: "org-a",
      role: "owner",
    });
    mockListByTenant.mockImplementation(async (tenantId: string) => [
      {
        id: tenantId === "org-a" ? "note-a" : "note-b",
        tenantId,
        title: "Scoped",
        body: "body",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);

    const { response, state } = fakeResponse();
    await handleNotesRoute(fakeRequest(), response);

    const body = JSON.parse(state.body) as {
      notes: Array<{ id: string }>;
    };
    expect(body.notes.map((note) => note.id)).toEqual(["note-a"]);
    expect(mockListByTenant).toHaveBeenCalledWith("org-a");
  });
});
