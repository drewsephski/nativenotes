/**
 * Mock product data for the web shell.
 * Folders remain visual placeholders; notes load from GET /api/notes.
 * Session and organizations are live Better Auth data.
 */

export interface MockFolder {
  id: string;
  name: string;
  parentId?: string;
  noteCount: number;
}

export interface MockNote {
  id: string;
  title: string;
  preview: string;
  body: string;
  updatedAt: string;
  folderId?: string;
  folderName?: string;
  tags: string[];
  favorite: boolean;
  trashed: boolean;
  deletedAt?: string;
}

export const MOCK_FOLDERS: MockFolder[] = [
  { id: "folder_product", name: "Product", noteCount: 2 },
  { id: "folder_engineering", name: "Engineering", noteCount: 2 },
  {
    id: "folder_mcp",
    name: "MCP",
    parentId: "folder_engineering",
    noteCount: 1,
  },
  { id: "folder_personal", name: "Personal", noteCount: 1 },
];

export const MOCK_NOTES: MockNote[] = [
  {
    id: "note_architecture",
    title: "NativeNotes architecture",
    preview:
      "MCP server at the edge, Better Auth for OAuth, Neon for persistence. Keep the web shell thin.",
    body: `# NativeNotes architecture

## Goals
- Production-proven MCP/backend stays at the repo root
- Next.js web app is a thin product shell over the same auth and data model
- AI clients and the web UI share one workspace context

## Current layout
- \`server.ts\` — MCP + OAuth entry
- \`apps/web\` — product UI (this shell)
- Shared Neon schema via Drizzle

## Constraints
Do not fork auth semantics. The web app should consume the existing Better Auth session and organization model when wired.`,
    updatedAt: "2026-09-26T14:22:00.000Z",
    folderId: "folder_engineering",
    folderName: "Engineering",
    tags: ["architecture"],
    favorite: true,
    trashed: false,
  },
  {
    id: "note_product",
    title: "Product direction",
    preview:
      "Developer-first notes that feel like Linear and Raycast — restrained, fast, keyboard-friendly.",
    body: `# Product direction

NativeNotes should feel like tooling developers already trust: Vercel, Linear, Raycast.

## Principles
- Monochrome UI, strong typography, quiet chrome
- Notes are the unit of work; AI clients get the same context
- Workspaces map to Better Auth organizations

## Near-term
1. App shell (done)
2. Real session + workspace selection
3. Notes list from MCP/API
4. Editor persistence`,
    updatedAt: "2026-09-25T18:05:00.000Z",
    folderId: "folder_product",
    folderName: "Product",
    tags: ["product"],
    favorite: true,
    trashed: false,
  },
  {
    id: "note_mcp",
    title: "MCP interoperability",
    preview:
      "ChatGPT and other MCP clients should see workspace instructions and notes as first-class context.",
    body: `# MCP interoperability

Connected clients authenticate via the existing OAuth provider flow.

## Surface area
- \`note.list\` and related tools remain the source of truth
- Workspace instructions become global context for AI clients
- Do not invent a parallel notes API for the web shell

## Status
- ChatGPT — Connected
- MCP endpoint — Enabled`,
    updatedAt: "2026-09-24T09:41:00.000Z",
    folderId: "folder_mcp",
    folderName: "MCP",
    tags: ["mcp", "ai"],
    favorite: false,
    trashed: false,
  },
  {
    id: "note_priorities",
    title: "Weekly priorities",
    preview:
      "Ship the web shell, wire Better Auth session, then read-only notes from the existing backend.",
    body: `# Weekly priorities

- [x] Monorepo + Next app scaffold
- [ ] Authenticated product shell (visual)
- [ ] Better Auth session in Next
- [ ] Workspace/org selector against real orgs
- [ ] Read-only notes list (no CRUD yet)

Keep scope tight. Visual shell first.`,
    updatedAt: "2026-09-23T21:12:00.000Z",
    folderId: "folder_product",
    folderName: "Product",
    tags: ["planning"],
    favorite: false,
    trashed: false,
  },
  {
    id: "note_ideas",
    title: "Ideas",
    preview:
      "Command palette for notes. Slash commands in the editor. Shared workspace instructions for AI.",
    body: `# Ideas

- Command palette (\`⌘K\`) scoped to notes and folders
- Slash commands in the editor for templates
- Per-workspace AI instructions exposed to MCP clients
- Favorites sync across devices
- Soft-delete with restore window before permanent purge

Capture freely; promote into Product or Engineering when ready.`,
    updatedAt: "2026-09-22T11:30:00.000Z",
    tags: ["ideas"],
    favorite: false,
    trashed: false,
  },
  {
    id: "note_scratchpad",
    title: "Personal scratchpad",
    preview:
      "Meeting notes, random links, half-formed thoughts. Nothing that needs a folder yet.",
    body: `# Personal scratchpad

- Follow up on CIMD validation script
- Check Neon branch for staging smoke tests
- Try Geist Mono for metadata rows in the list panel

---

Random: the empty state copy should stay quiet — no giant icons.`,
    updatedAt: "2026-09-20T16:48:00.000Z",
    folderId: "folder_personal",
    folderName: "Personal",
    tags: [],
    favorite: false,
    trashed: false,
  },
  {
    id: "note_trash_old_brief",
    title: "Old launch brief",
    preview: "Superseded draft from the first positioning pass.",
    body: `# Old launch brief

Deprecated. Kept only to exercise the Trash view.`,
    updatedAt: "2026-09-10T08:00:00.000Z",
    tags: ["archive"],
    favorite: false,
    trashed: true,
    deletedAt: "2026-09-18T12:00:00.000Z",
  },
  {
    id: "note_trash_duplicate",
    title: "Duplicate architecture notes",
    preview: "Merged into NativeNotes architecture.",
    body: `# Duplicate architecture notes

Content merged elsewhere.`,
    updatedAt: "2026-09-12T15:20:00.000Z",
    folderName: "Engineering",
    tags: [],
    favorite: false,
    trashed: true,
    deletedAt: "2026-09-19T09:30:00.000Z",
  },
];

export function getActiveNotes(): MockNote[] {
  return MOCK_NOTES.filter((note) => !note.trashed);
}

export function getFavoriteNotes(): MockNote[] {
  return getActiveNotes().filter((note) => note.favorite);
}

export function getTrashedNotes(): MockNote[] {
  return MOCK_NOTES.filter((note) => note.trashed);
}

export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date("2026-09-26T15:00:00.000Z");
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 60) return `${Math.max(diffMins, 1)}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function formatAbsoluteDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
