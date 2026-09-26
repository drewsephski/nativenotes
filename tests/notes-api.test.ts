const noteDefaults = { folderId: null, summary: null, favorited: false, freshness: "current" as const, verifiedAt: null, archivedAt: null, trashedAt: null, purgeAfter: null, createdByUserId: null };
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

const mockGetSession = vi.fn();
const mockFindOne = vi.fn();
const mockListByTenant = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockFindByTenantAndId = vi.fn();

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
    update: (...args: unknown[]) => mockUpdate(...args),
    findByTenantAndId: (...args: unknown[]) => mockFindByTenantAndId(...args),
  },
}));

vi.mock("better-auth/node", () => ({
  fromNodeHeaders: () => new Headers({ cookie: "session=test" }),
}));

const { handleNotesRoute } = await import("../src/server/notes-route.js");
const {
  createNoteForTenant,
  updateNoteForTenant,
} = await import("../src/services/note-service.js");
const { isTrustedMutationOrigin } = await import(
  "../src/server/request-origin.js"
);
const {
  NoteNotFoundError,
  NoteVersionConflictError,
} = await import("../src/domain/errors.js");

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

function fakePatchRequest(options: {
  body: unknown;
  origin?: string;
  url: string;
}): IncomingMessage {
  const payload =
    typeof options.body === "string"
      ? options.body
      : JSON.stringify(options.body);
  const stream = Readable.from([payload]) as IncomingMessage;
  stream.method = "PATCH";
  stream.url = options.url;
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

const memberA = {
  id: "member-a",
  userId: "user-a",
  organizationId: "org-a",
  role: "owner",
};

describe("createNoteForTenant", () => {
  it("assigns the requested tenant and maps the public note shape with version 1", async () => {
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
          ...noteDefaults,
          id: input.id,
          tenantId: input.tenantId,
          title: input.title,
          body: input.body,
          version: 1,
          createdAt,
          updatedAt,
        };
      },
      async update() {
        return null;
      },
      async findByTenantAndId() {
        return null;
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
      version: 1,
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
  });
});

describe("updateNoteForTenant", () => {
  it("returns the updated public note when the atomic update succeeds", async () => {
    const repository = {
      async listByTenant() {
        return [];
      },
      async create() {
        throw new Error("unused");
      },
      async update(input: {
        tenantId: string;
        noteId: string;
        expectedVersion: number;
        title: string;
        body: string;
      }) {
        expect(input).toEqual({
          tenantId: "org-a",
          noteId: "note-1",
          expectedVersion: 1,
          title: "Updated",
          body: "New body",
        });
        return {
          ...noteDefaults,
          id: "note-1",
          tenantId: "org-a",
          title: "Updated",
          body: "New body",
          version: 2,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        };
      },
      async findByTenantAndId() {
        throw new Error("should not be called on success");
      },
    };

    await expect(
      updateNoteForTenant(
        {
          tenantId: "org-a",
          noteId: "note-1",
          expectedVersion: 1,
          title: "Updated",
          body: "New body",
        },
        repository,
      ),
    ).resolves.toEqual({
      id: "note-1",
      title: "Updated",
      body: "New body",
      version: 2,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
  });

  it("throws NoteNotFoundError when no row updates and note is absent for tenant", async () => {
    const repository = {
      async listByTenant() {
        return [];
      },
      async create() {
        throw new Error("unused");
      },
      async update() {
        return null;
      },
      async findByTenantAndId() {
        return null;
      },
    };

    await expect(
      updateNoteForTenant(
        {
          tenantId: "org-a",
          noteId: "missing",
          expectedVersion: 1,
          title: "X",
          body: "Y",
        },
        repository,
      ),
    ).rejects.toBeInstanceOf(NoteNotFoundError);
  });

  it("throws NoteVersionConflictError with currentVersion when note exists but version is stale", async () => {
    const repository = {
      async listByTenant() {
        return [];
      },
      async create() {
        throw new Error("unused");
      },
      async update() {
        return null;
      },
      async findByTenantAndId() {
        return {
          ...noteDefaults,
          id: "note-1",
          tenantId: "org-a",
          title: "Server",
          body: "Server body",
          version: 4,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-03T00:00:00.000Z"),
        };
      },
    };

    await expect(
      updateNoteForTenant(
        {
          tenantId: "org-a",
          noteId: "note-1",
          expectedVersion: 1,
          title: "Stale",
          body: "Stale body",
        },
        repository,
      ),
    ).rejects.toMatchObject({
      name: "NoteVersionConflictError",
      currentVersion: 4,
    });
    await expect(
      updateNoteForTenant(
        {
          tenantId: "org-a",
          noteId: "note-1",
          expectedVersion: 1,
          title: "Stale",
          body: "Stale body",
        },
        repository,
      ),
    ).rejects.toBeInstanceOf(NoteVersionConflictError);
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
        version: 1,
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
        version: 1,
        createdAt: new Date("2026-01-03T00:00:00.000Z"),
        updatedAt: new Date("2026-01-03T00:00:00.000Z"),
      }),
    );
    mockUpdate.mockResolvedValue(null);
    mockFindByTenantAndId.mockResolvedValue(null);
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

  it("returns notes for the session active organization including version", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-a" },
      session: { activeOrganizationId: "org-a" },
    });
    mockFindOne.mockResolvedValue(memberA);

    const { response, state } = fakeResponse();
    await handleNotesRoute(fakeGetRequest(), response);

    expect(state.statusCode).toBe(200);
    expect(JSON.parse(state.body)).toEqual({
      notes: [
        {
          id: "note-a",
          title: "Scoped note",
          body: "body",
          version: 1,
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
    mockFindOne.mockResolvedValue(memberA);

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
    mockFindOne.mockResolvedValue(memberA);
    mockListByTenant.mockImplementation(async (tenantId: string) => [
      {
        id: tenantId === "org-a" ? "note-a" : "note-b",
        tenantId,
        title: "Scoped",
        body: "body",
        version: 1,
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
    mockFindOne.mockResolvedValue(memberA);
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

  it("POST creates a note for the active tenant and returns 201 with version 1", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-a" },
      session: { activeOrganizationId: "org-a" },
    });
    mockFindOne.mockResolvedValue(memberA);

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
      version: number;
      createdAt: string;
      updatedAt: string;
    };
    expect(body.title).toBe("My note");
    expect(body.body).toBe("hello");
    expect(body.version).toBe(1);
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
    mockFindOne.mockResolvedValue(memberA);

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
    mockFindOne.mockResolvedValue(memberA);
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
    mockFindOne.mockResolvedValue(memberA);

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

  it("PATCH updates a note and increments version", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-a" },
      session: { activeOrganizationId: "org-a" },
    });
    mockFindOne.mockResolvedValue(memberA);
    mockUpdate.mockResolvedValue({
      id: "note-a",
      tenantId: "org-a",
      title: "Edited",
      body: "Edited body",
      version: 2,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-04T00:00:00.000Z"),
    });

    const { response, state } = fakeResponse();
    await handleNotesRoute(
      fakePatchRequest({
        url: "/api/notes/note-a",
        body: { title: "Edited", body: "Edited body", expectedVersion: 1 },
        origin: "http://localhost:3001",
      }),
      response,
    );

    expect(state.statusCode).toBe(200);
    expect(JSON.parse(state.body)).toEqual({
      id: "note-a",
      title: "Edited",
      body: "Edited body",
      version: 2,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-04T00:00:00.000Z",
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      tenantId: "org-a",
      noteId: "note-a",
      expectedVersion: 1,
      title: "Edited",
      body: "Edited body",
    });
  });

  it("PATCH returns 409 version_conflict when expectedVersion is stale", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-a" },
      session: { activeOrganizationId: "org-a" },
    });
    mockFindOne.mockResolvedValue(memberA);
    mockUpdate.mockResolvedValue(null);
    mockFindByTenantAndId.mockResolvedValue({
      id: "note-a",
      tenantId: "org-a",
      title: "Current",
      body: "Current body",
      version: 4,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-05T00:00:00.000Z"),
    });

    const { response, state } = fakeResponse();
    await handleNotesRoute(
      fakePatchRequest({
        url: "/api/notes/note-a",
        body: { title: "Stale", body: "Stale", expectedVersion: 1 },
        origin: "http://localhost:3001",
      }),
      response,
    );

    expect(state.statusCode).toBe(409);
    expect(JSON.parse(state.body)).toEqual({
      error: "version_conflict",
      currentVersion: 4,
    });
  });

  it("PATCH returns 404 when note is not found for the active tenant", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-a" },
      session: { activeOrganizationId: "org-a" },
    });
    mockFindOne.mockResolvedValue(memberA);
    mockUpdate.mockResolvedValue(null);
    mockFindByTenantAndId.mockResolvedValue(null);

    const { response, state } = fakeResponse();
    await handleNotesRoute(
      fakePatchRequest({
        url: "/api/notes/missing",
        body: { title: "X", body: "Y", expectedVersion: 1 },
        origin: "http://localhost:3001",
      }),
      response,
    );

    expect(state.statusCode).toBe(404);
    expect(JSON.parse(state.body)).toEqual({ error: "not_found" });
  });

  it("PATCH returns 404 for cross-tenant note ids without disclosure", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-a" },
      session: { activeOrganizationId: "org-a" },
    });
    mockFindOne.mockResolvedValue(memberA);
    mockUpdate.mockResolvedValue(null);
    // Tenant-scoped lookup finds nothing even if the id exists elsewhere.
    mockFindByTenantAndId.mockResolvedValue(null);

    const { response, state } = fakeResponse();
    await handleNotesRoute(
      fakePatchRequest({
        url: "/api/notes/note-owned-by-b",
        body: {
          title: "Hijack",
          body: "nope",
          expectedVersion: 1,
          tenantId: "org-b",
        },
        origin: "http://localhost:3001",
      }),
      response,
    );

    expect(state.statusCode).toBe(404);
    expect(JSON.parse(state.body)).toEqual({ error: "not_found" });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "org-a", noteId: "note-owned-by-b" }),
    );
    expect(mockUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "org-b" }),
    );
    expect(mockFindByTenantAndId).toHaveBeenCalledWith(
      "org-a",
      "note-owned-by-b",
    );
  });

  it("PATCH returns 400 for malformed input", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-a" },
      session: { activeOrganizationId: "org-a" },
    });
    const { response, state } = fakeResponse();
    await handleNotesRoute(
      fakePatchRequest({
        url: "/api/notes/note-a",
        body: { title: "X", body: "Y", expectedVersion: 0 },
        origin: "http://localhost:3001",
      }),
      response,
    );
    expect(state.statusCode).toBe(400);
    expect(JSON.parse(state.body)).toEqual({ error: "invalid_request" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("PATCH rejects arbitrary Origin", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-a" },
      session: { activeOrganizationId: "org-a" },
    });
    const { response, state } = fakeResponse();
    await handleNotesRoute(
      fakePatchRequest({
        url: "/api/notes/note-a",
        body: { title: "X", body: "Y", expectedVersion: 1 },
        origin: "https://evil.example",
      }),
      response,
    );
    expect(state.statusCode).toBe(403);
    expect(JSON.parse(state.body)).toEqual({ error: "forbidden" });
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("PATCH returns 403 when membership was removed", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-a" },
      session: { activeOrganizationId: "org-a" },
    });
    mockFindOne.mockResolvedValue(null);
    const { response, state } = fakeResponse();
    await handleNotesRoute(
      fakePatchRequest({
        url: "/api/notes/note-a",
        body: { title: "X", body: "Y", expectedVersion: 1 },
        origin: "http://localhost:3001",
      }),
      response,
    );
    expect(state.statusCode).toBe(403);
    expect(JSON.parse(state.body)).toEqual({ error: "forbidden" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("PATCH ignores body tenantId and uses session org only", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-a" },
      session: { activeOrganizationId: "org-a" },
    });
    mockFindOne.mockResolvedValue(memberA);
    mockUpdate.mockResolvedValue({
      id: "note-a",
      tenantId: "org-a",
      title: "Safe",
      body: "Safe",
      version: 2,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-04T00:00:00.000Z"),
    });

    const { response, state } = fakeResponse();
    await handleNotesRoute(
      fakePatchRequest({
        url: "/api/notes/note-a",
        body: {
          title: "Safe",
          body: "Safe",
          expectedVersion: 1,
          tenantId: "org-b",
        },
        origin: "http://localhost:3001",
      }),
      response,
    );

    expect(state.statusCode).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "org-a" }),
    );
  });
});
