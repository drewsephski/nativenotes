import { getNativeNotesApiUrl } from "@/lib/config";

export type Note = {
  id: string;
  title: string;
  body: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type NotesApiErrorCode =
  | "unauthorized"
  | "no_active_workspace"
  | "forbidden"
  | "invalid_request"
  | "not_found"
  | "version_conflict"
  | "network"
  | "invalid_response"
  | "unknown";

export class NotesApiError extends Error {
  readonly code: NotesApiErrorCode;
  readonly status?: number;
  readonly currentVersion?: number;

  constructor(
    code: NotesApiErrorCode,
    message: string,
    status?: number,
    currentVersion?: number,
  ) {
    super(message);
    this.name = "NotesApiError";
    this.code = code;
    this.status = status;
    this.currentVersion = currentVersion;
  }
}

function previewFromBody(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat.length <= 120) return flat;
  return `${flat.slice(0, 117)}…`;
}

/** List-row shape used by the notes list UI. */
export function toNoteListItem(note: Note) {
  return {
    ...note,
    preview: previewFromBody(note.body),
  };
}

export type NoteListItem = ReturnType<typeof toNoteListItem>;

function isNote(value: unknown): value is Note {
  if (!value || typeof value !== "object") return false;
  const note = value as Record<string, unknown>;
  return (
    typeof note.id === "string" &&
    typeof note.title === "string" &&
    typeof note.body === "string" &&
    typeof note.version === "number" &&
    Number.isInteger(note.version) &&
    typeof note.createdAt === "string" &&
    typeof note.updatedAt === "string"
  );
}

function parseNotesPayload(payload: unknown): Note[] | null {
  if (!payload || typeof payload !== "object") return null;
  const notes = (payload as { notes?: unknown }).notes;
  if (!Array.isArray(notes)) return null;
  if (!notes.every(isNote)) return null;
  return notes;
}

function mapErrorResponse(
  status: number,
  fallbackMessage: string,
  payload?: unknown,
): NotesApiError {
  if (status === 401) {
    return new NotesApiError("unauthorized", "Sign in required.", 401);
  }
  if (status === 404) {
    return new NotesApiError("not_found", "Note not found.", 404);
  }
  if (status === 409) {
    const errorCode =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof (payload as { error: unknown }).error === "string"
        ? (payload as { error: string }).error
        : undefined;
    if (errorCode === "version_conflict") {
      const currentVersion =
        payload &&
        typeof payload === "object" &&
        "currentVersion" in payload &&
        typeof (payload as { currentVersion: unknown }).currentVersion ===
          "number"
          ? (payload as { currentVersion: number }).currentVersion
          : undefined;
      return new NotesApiError(
        "version_conflict",
        "This note changed somewhere else.",
        409,
        currentVersion,
      );
    }
    return new NotesApiError(
      "no_active_workspace",
      "Select a workspace to view notes.",
      409,
    );
  }
  if (status === 403) {
    return new NotesApiError(
      "forbidden",
      "You no longer have access to this workspace.",
      403,
    );
  }
  if (status === 400) {
    return new NotesApiError(
      "invalid_request",
      "Check the note title and try again.",
      400,
    );
  }
  return new NotesApiError("unknown", fallbackMessage, status);
}

/**
 * Fetch tenant-scoped notes from the existing Node backend.
 * Tenant comes from the Better Auth session cookie — never send tenantId.
 */
export async function fetchNotes(): Promise<Note[]> {
  const url = new URL("/api/notes", getNativeNotesApiUrl());

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: { accept: "application/json" },
    });
  } catch {
    throw new NotesApiError("network", "Could not reach the notes API.");
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw mapErrorResponse(response.status, "Could not load notes.", payload);
  }

  const notes = parseNotesPayload(payload);
  if (!notes) {
    throw new NotesApiError(
      "invalid_response",
      "Notes response was not valid.",
      response.status,
    );
  }

  return notes;
}

export type CreateNoteInput = {
  title: string;
  body: string;
};

/**
 * Create a note in the active workspace.
 * Tenant comes from the Better Auth session cookie — never send tenantId.
 */
export async function createNote(input: CreateNoteInput): Promise<Note> {
  const url = new URL("/api/notes", getNativeNotesApiUrl());

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: input.title,
        body: input.body,
      }),
    });
  } catch {
    throw new NotesApiError("network", "Could not reach the notes API.");
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw mapErrorResponse(response.status, "Could not create note.", payload);
  }

  if (!isNote(payload)) {
    throw new NotesApiError(
      "invalid_response",
      "Create note response was not valid.",
      response.status,
    );
  }

  return payload;
}

export type UpdateNoteInput = {
  id: string;
  title: string;
  body: string;
  expectedVersion: number;
};

/**
 * Update an existing note with optimistic concurrency.
 * Tenant comes from the Better Auth session cookie — never send tenantId.
 */
export async function updateNote(input: UpdateNoteInput): Promise<Note> {
  const url = new URL(`/api/notes/${encodeURIComponent(input.id)}`, getNativeNotesApiUrl());

  let response: Response;
  try {
    response = await fetch(url, {
      method: "PATCH",
      credentials: "include",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: input.title,
        body: input.body,
        expectedVersion: input.expectedVersion,
      }),
    });
  } catch {
    throw new NotesApiError("network", "Could not reach the notes API.");
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw mapErrorResponse(response.status, "Could not save note.", payload);
  }

  if (!isNote(payload)) {
    throw new NotesApiError(
      "invalid_response",
      "Update note response was not valid.",
      response.status,
    );
  }

  return payload;
}
