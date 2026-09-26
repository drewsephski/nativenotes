import { getNativeNotesApiUrl } from "@/lib/config";

export type Note = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type NotesApiErrorCode =
  | "unauthorized"
  | "no_active_workspace"
  | "forbidden"
  | "network"
  | "invalid_response"
  | "unknown";

export class NotesApiError extends Error {
  readonly code: NotesApiErrorCode;
  readonly status?: number;

  constructor(code: NotesApiErrorCode, message: string, status?: number) {
    super(message);
    this.name = "NotesApiError";
    this.code = code;
    this.status = status;
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

  if (response.status === 401) {
    throw new NotesApiError("unauthorized", "Sign in required.", 401);
  }
  if (response.status === 409) {
    throw new NotesApiError(
      "no_active_workspace",
      "Select a workspace to view notes.",
      409,
    );
  }
  if (response.status === 403) {
    throw new NotesApiError(
      "forbidden",
      "You no longer have access to this workspace.",
      403,
    );
  }
  if (!response.ok) {
    throw new NotesApiError(
      "unknown",
      "Could not load notes.",
      response.status,
    );
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
