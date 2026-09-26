import { describe, expect, it, vi, beforeEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

const mockGetSession = vi.fn();
const mockFindOne = vi.fn();
const mockListByTenant = vi.fn();
const mockCreate = vi.fn();

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
    create: (...args: unknown[]) => mockCreate(...args),
  },
}));

vi.mock("better-auth/node", () => ({
  fromNodeHeaders: () => new Headers({ cookie: "session=test" }),
}));

const { handleNotesRoute } = await import("../src/server/notes-route.js");
const { createNoteForTenant } = await import("../src/services/note-service.js");
const { isTrustedMutationOrigin } = await import(
  "../src/server/request-origin.js"
);

function fakeGetRequest(url = "/api/notes"): IncomingMessage {
  return {
    method: "GET",
    url,
    headers: { cookie: "session=test" },
  } as IncomingMessage;
}

function fakePostRequest(options: {
  body: unknown;
  origin?: string;
  url?: string;
}): IncomingMessage {
  const payload =
    typeof options.body === "string"
      ? options.body
      : JSON.stringify(options.body);
  const stream = Readable.from([payload]) as IncomingMessage;
  stream.method = "POST";
  stream.url = options.url ?? "/api/notes";
  stream.headers = {
    cookie: "session=test",
    "content-type": "application/json",
    ...(options.origin ? { origin: options.origin } : {}),
  };
  return stream;
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

describe("createNoteForTenant", () => {
  it("assigns the requested tenant and maps the public note shape", async () => {
    const createdAt = new Date("2026-01-02T00:00:00.000Z");
    const updatedAt = new Date("2026-01-02T00:00:00.000Z");
    const repository = {
      async listByTenant() {
        return [];
      },
      async create(input: {
        id: string;
        tenantId: string;
        title: string;
        body: string;
      }) {
        expect(input.tenantId).toBe("org-a");
        expect(input.title).toBe("Hello");
        expect(input.body).toBe("World");
        expect(input.id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        );
        return {
          id: input.id,
          tenantId: input.tenantId,
          title: input.title,
          body: input.body,
          createdAt,
          updatedAt,
        };
      },
    };

    const note = await createNoteForTenant(
      { tenantId: "org-a", title: "Hello", body: "World" },
      repository,
    );

    expect(note).toEqual({
      id: note.id,
      title: "Hello",
      body: "World",
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
  });
});

describe("isTrustedMutationOrigin", () => {
  it("accepts the local web origin", () => {
    expect(
      isTrustedMutationOrigin({
        headers: { origin: "http://localhost:3001" },
      } as IncomingMessage),
    ).toBe(true);
  });

  it("rejects arbitrary origins", () => {
    expect(
      isTrustedMutationOrigin({
        headers: { origin: "https://evil.example" },
      } as IncomingMessage),
    ).toBe(false);
  });

  it("rejects missing origin", () => {
    expect(
      isTrustedMutationOrigin({
        headers: {},
      } as IncomingMessage),
    ).toBe(false);
  });
});

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
    mockCreate.mockImplementation(
      async (input: {
        id: string;
        tenantId: string;
        title: string;
        body: string;
      }) => ({
        id: input.id,
        tenantId: input.tenantId,
        title: input.title,
        body: input.body,
        createdAt: new Date("2026-01-03T00:00:00.000Z"),
        updatedAt: new Date("2026-01-03T00:00:00.000Z"),
      }),
    );
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { response, state } = fakeResponse();
    await handleNotesRoute(fakeGetRequest(), response);
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
    await handleNotesRoute(fakeGetRequest(), response);
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
    await handleNotesRoute(fakeGetRequest(), response);

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
      fakeGetRequest("/api/notes?tenantId=org-b"),
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
    await handleNotesRoute(fakeGetRequest(), response);

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
    await handleNotesRoute(fakeGetRequest(), response);

    const body = JSON.parse(state.body) as {
      notes: Array<{ id: string }>;
    };
    expect(body.notes.map((note) => note.id)).toEqual(["note-a"]);
    expect(mockListByTenant).toHaveBeenCalledWith("org-a");
  });

  it("POST returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { response, state } = fakeResponse();
    await handleNotesRoute(
      fakePostRequest({
        body: { title: "New", body: "" },
        origin: "http://localhost:3001",
      }),
      response,
    );
    expect(state.statusCode).toBe(401);
    expect(JSON.parse(state.body)).toEqual({ error: "unauthorized" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("POST returns 409 when no active organization", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-a" },
      session: { activeOrganizationId: null },
    });
    const { response, state } = fakeResponse();
    await handleNotesRoute(
      fakePostRequest({
        body: { title: "New", body: "" },
        origin: "http://localhost:3001",
      }),
      response,
    );
    expect(state.statusCode).toBe(409);
    expect(JSON.parse(state.body)).toEqual({ error: "no_active_workspace" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("POST returns 403 when membership is missing", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-a" },
      session: { activeOrganizationId: "org-a" },
    });
    mockFindOne.mockResolvedValue(null);
    const { response, state } = fakeResponse();
    await handleNotesRoute(
      fakePostRequest({
        body: { title: "New", body: "" },
        origin: "http://localhost:3001",
      }),
      response,
    );
    expect(state.statusCode).toBe(403);
    expect(JSON.parse(state.body)).toEqual({ error: "forbidden" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("POST returns 400 for malformed JSON", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-a" },
      session: { activeOrganizationId: "org-a" },
    });
    const { response, state } = fakeResponse();
    await handleNotesRoute(
      fakePostRequest({
        body: "{not-json",
        origin: "http://localhost:3001",
      }),
      response,
    );
    expect(state.statusCode).toBe(400);
    expect(JSON.parse(state.body)).toEqual({ error: "invalid_request" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("POST returns 400 for empty title", async () => {
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
      fakePostRequest({
        body: { title: "   ", body: "x" },
        origin: "http://localhost:3001",
      }),
      response,
    );
    expect(state.statusCode).toBe(400);
    expect(JSON.parse(state.body)).toEqual({ error: "invalid_request" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("POST returns 400 for invalid title type", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-a" },
      session: { activeOrganizationId: "org-a" },
    });
    const { response, state } = fakeResponse();
    await handleNotesRoute(
      fakePostRequest({
        body: { title: 42, body: "" },
        origin: "http://localhost:3001",
      }),
      response,
    );
    expect(state.statusCode).toBe(400);
    expect(JSON.parse(state.body)).toEqual({ error: "invalid_request" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("POST creates a note for the active tenant and returns 201", async () => {
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
      fakePostRequest({
        body: { title: " My note ", body: "hello" },
        origin: "http://localhost:3001",
      }),
      response,
    );

    expect(state.statusCode).toBe(201);
    const body = JSON.parse(state.body) as {
      id: string;
      title: string;
      body: string;
      createdAt: string;
      updatedAt: string;
    };
    expect(body.title).toBe("My note");
    expect(body.body).toBe("hello");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "org-a",
        title: "My note",
        body: "hello",
      }),
    );
  });

  it("POST ignores client-supplied tenantId", async () => {
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
      fakePostRequest({
        body: { title: "Scoped", body: "", tenantId: "org-b" },
        origin: "http://localhost:3001",
      }),
      response,
    );

    expect(state.statusCode).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "org-a" }),
    );
    expect(mockCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "org-b" }),
    );
  });

  it("POST rejects arbitrary Origin", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-a" },
      session: { activeOrganizationId: "org-a" },
    });
    const { response, state } = fakeResponse();
    await handleNotesRoute(
      fakePostRequest({
        body: { title: "New", body: "" },
        origin: "https://evil.example",
      }),
      response,
    );
    expect(state.statusCode).toBe(403);
    expect(JSON.parse(state.body)).toEqual({ error: "forbidden" });
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("POST accepts trusted web Origin", async () => {
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
      fakePostRequest({
        body: { title: "Trusted", body: "" },
        origin: "http://localhost:3001",
      }),
      response,
    );
    expect(state.statusCode).toBe(201);
    expect(mockCreate).toHaveBeenCalled();
  });

  it("created note is scoped to the active tenant only", async () => {
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
      fakePostRequest({
        body: { title: "Only A", body: "" },
        origin: "http://localhost:3001",
      }),
      response,
    );

    expect(state.statusCode).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "org-a" }),
    );
    expect(mockCreate.mock.calls[0]?.[0].tenantId).not.toBe("org-b");
  });
});
