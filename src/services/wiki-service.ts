import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { notes } from "../db/schema.js";

/** v1 syntax: [[title]], outside fenced/inline code; ambiguous titles do not resolve. */
export function wikiTitles(body: string): string[] {
  const prose = body.replace(/```[\s\S]*?```|`[^`\n]*`/g, "");
  return [...new Set(Array.from(prose.matchAll(/\[\[([^\n[\]]{1,200})\]\]/g), match => match[1]!.trim()).filter(Boolean))];
}
export function resolveWikiGraph(rows: { id: string; title: string; body: string }[]) {
  const byTitle = new Map<string, string[]>();
  for (const row of rows) {
    const key = row.title.trim().toLowerCase();
    byTitle.set(key, [...(byTitle.get(key) ?? []), row.id]);
  }
  const edges: { source: string; target: string; title: string }[] = [];
  for (const row of rows) for (const title of wikiTitles(row.body)) {
    const matches = byTitle.get(title.toLowerCase());
    if (matches?.length === 1) edges.push({ source: row.id, target: matches[0]!, title });
  }
  return { nodes: rows.map(({ id, title }) => ({ id, title })), edges };
}
export async function wikiGraph(tenantId: string) {
  const rows = await db.select({ id: notes.id, title: notes.title, body: notes.body }).from(notes)
    .where(and(eq(notes.tenantId, tenantId), isNull(notes.archivedAt), isNull(notes.trashedAt))).orderBy(notes.id);
  return resolveWikiGraph(rows);
}
