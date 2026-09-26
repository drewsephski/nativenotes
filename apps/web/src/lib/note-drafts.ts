export type NoteDraft = {
  title: string;
  body: string;
  summary: string;
  version: number;
};
export function draftKey(userId: string, workspaceId: string, noteId: string) {
  return `nativenotes:draft:${userId}:${workspaceId}:${noteId}`;
}
export function readDraft(key: string): NoteDraft | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (!value || typeof value !== "object") return null;
    const d = value as Partial<NoteDraft>;
    return typeof d.title === "string" &&
      typeof d.body === "string" &&
      typeof d.summary === "string" &&
      Number.isInteger(d.version)
      ? (d as NoteDraft)
      : null;
  } catch {
    return null;
  }
}
export function storeDraft(key: string, value: NoteDraft | null) {
  try {
    if (value) sessionStorage.setItem(key, JSON.stringify(value));
    else sessionStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
