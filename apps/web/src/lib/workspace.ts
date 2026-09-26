/**
 * Workspace slug helpers for Better Auth organization.create.
 */

export function slugifyWorkspaceName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base.length > 0 ? base : "workspace";
}

export function suggestedWorkspaceName(userName: string | undefined): string {
  const trimmed = userName?.trim();
  if (!trimmed) return "Personal";
  const first = trimmed.split(/\s+/)[0];
  if (!first) return "Personal";
  return `${first}'s Workspace`;
}

export function userInitials(name: string | undefined, email: string | undefined): string {
  const source = name?.trim() || email?.trim() || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0]?.[0] ?? "";
    const last = parts[1]?.[0] ?? "";
    return `${first}${last}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}
