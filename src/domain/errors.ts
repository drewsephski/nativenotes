export class ForbiddenError extends Error {
  readonly status = 403;

  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Note is absent for the caller's tenant (never reveals other tenants). */
export class NoteNotFoundError extends Error {
  constructor(message = "Note not found") {
    super(message);
    this.name = "NoteNotFoundError";
  }
}

/** Conditional update matched no row because expectedVersion is stale. */
export class NoteVersionConflictError extends Error {
  readonly currentVersion: number;

  constructor(currentVersion: number, message = "Note version conflict") {
    super(message);
    this.name = "NoteVersionConflictError";
    this.currentVersion = currentVersion;
  }
}
