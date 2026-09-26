"use client";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import type { Graph } from "@/lib/product-api";
type MarkdownNode = { type: string; value?: string; url?: string; children?: MarkdownNode[] };
function wikiPlugin(nodes: Graph["nodes"]) {
  const titles = new Map<string, string[]>();
  nodes.forEach(n => { const key = n.title.trim().toLowerCase(); titles.set(key, [...(titles.get(key) ?? []), n.id]); });
  return () => (tree: unknown) => {
    function visit(node: MarkdownNode) {
      if (!node.children || ["link", "code", "inlineCode"].includes(node.type)) return;
      node.children = node.children.flatMap(child => {
        if (child.type !== "text" || !child.value) { visit(child); return [child]; }
        const result: MarkdownNode[] = []; let cursor = 0;
        for (const match of child.value.matchAll(/\[\[([^\n[\]]{1,200})\]\]/g)) {
          const matches = titles.get(match[1].trim().toLowerCase());
          if (matches?.length !== 1) continue;
          result.push({ type: "text", value: child.value.slice(cursor, match.index) });
          result.push({ type: "link", url: `/app/notes/${encodeURIComponent(matches[0])}`, children: [{ type: "text", value: match[1] }] });
          cursor = match.index + match[0].length;
        }
        result.push({ type: "text", value: child.value.slice(cursor) }); return result;
      });
    }
    visit(tree as MarkdownNode);
  };
}
export function MarkdownBody({ body, nodes = [] }: { body: string; nodes?: Graph["nodes"] }) {
  return <div className="document"><Markdown remarkPlugins={[remarkGfm, wikiPlugin(nodes)]} skipHtml components={{
    a: ({ href, children }) => href?.startsWith("/app/notes/") ? <Link href={href}>{children}</Link> : <a href={href} rel="noreferrer">{children}</a>,
    // No unprompted third-party image requests from private notes.
    img: ({ src, alt }) => <a href={typeof src === "string" ? src : undefined} rel="noreferrer">Image: {alt || "Open image"}</a>,
  }}>{body}</Markdown></div>;
}
