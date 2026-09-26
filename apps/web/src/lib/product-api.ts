import { getNativeNotesApiUrl } from "./config";
export type Folder = { id: string; parentId: string | null; name: string; position: number; archivedAt: string | null };
export type Tag = { id: string; name: string; noteCount: number };
export type ProductNote = {
  id: string; title: string; body: string; summary: string | null; folderId: string | null;
  favorited: boolean; freshness: "current" | "needs_review" | "superseded";
  version: number; createdAt: string; updatedAt: string; createdByUserId: string | null;
  verifiedAt: string | null; archivedAt: string | null; trashedAt: string | null; purgeAfter: string | null;
  tags?: { id: string; name: string }[];
};
export type Navigation = { folders: Folder[]; counts: Record<"all" | "inbox" | "favorites" | "archive" | "trash", number>; folderCounts: Record<string, number> };
export type Revision = { id: string; version: number; title: string; body: string; summary: string | null; authorUserId: string | null; createdAt: string };
export type InstructionChain = { chain: { folderId: string | null; scopeType: string; name: string; instructions: string }[] };
export type Graph = { nodes: { id: string; title: string }[]; edges: { source: string; target: string; title: string }[] };
export type NoteResults = { notes: ProductNote[]; hasMore: boolean };
export class ProductApiError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) { super(message); }
}
export async function productRequest<T>(workspaceId: string, resource: string, options?: { command: string; input: unknown }, signal?: AbortSignal): Promise<T> {
  const response = await fetch(new URL(`/api/workspace/${resource}`, getNativeNotesApiUrl()), {
    credentials: "include", signal,
    method: options ? "POST" : "GET",
    headers: { "content-type": "application/json", "x-workspace-id": workspaceId },
    ...(options ? { body: JSON.stringify(options) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new ProductApiError(data.message ?? "Could not complete the request", data.error ?? "unknown", response.status);
  return data as T;
}
