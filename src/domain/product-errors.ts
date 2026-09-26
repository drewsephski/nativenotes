import { ZodError } from "zod";
import {
  ForbiddenError,
  NoteNotFoundError,
  NoteVersionConflictError,
} from "./errors.js";
import { ProductError } from "./product-inputs.js";

export function productError(error: unknown) {
  if (error instanceof ForbiddenError)
    return { status: 403, error: "forbidden", message: error.message };
  if (error instanceof NoteNotFoundError)
    return { status: 404, error: "not_found", message: "Note not found" };
  if (error instanceof NoteVersionConflictError)
    return {
      status: 409,
      error: "version_conflict",
      message: "This note changed elsewhere. Your draft has been kept.",
      currentVersion: error.currentVersion,
    };
  if (error instanceof ProductError)
    return { status: error.status, error: error.code, message: error.message };
  if (error instanceof ZodError || error instanceof SyntaxError)
    return {
      status: 400,
      error: "invalid_request",
      message: "Check the submitted fields",
    };
  const cause =
    error && typeof error === "object" && "cause" in error
      ? error.cause
      : error;
  if (cause && typeof cause === "object" && "code" in cause) {
    if (cause.code === "23505")
      return {
        status: 409,
        error: "duplicate",
        message: "That name already exists in this workspace",
      };
    if (cause.code === "23503")
      return {
        status: 404,
        error: "not_found",
        message: "Related item not found in this workspace",
      };
  }
  return {
    status: 500,
    error: "internal_server_error",
    message: "Could not complete the request",
  };
}
