"use client";
import Link from "next/link";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import type { Graph } from "@/lib/product-api";
import { useResource } from "./product-context";
export function GraphPage() {
  const { data, error } = useResource<Graph>("graph");
  const [query, setQuery] = useState("");
  const filtered =
    data?.nodes.filter((n) =>
      n.title.toLowerCase().includes(query.toLowerCase()),
    ) ?? [];
  const visible = filtered.slice(0, 40);
  const positions = new Map(
    visible.map((node, i) => {
      const angle =
        (i / Math.max(1, visible.length)) * Math.PI * 2 - Math.PI / 2;
      return [
        node.id,
        { x: 360 + Math.cos(angle) * 245, y: 270 + Math.sin(angle) * 190 },
      ];
    }),
  );
  return (
    <div className="page-scroll">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Connections in your workspace</p>
          <h1>Knowledge graph</h1>
        </div>
      </div>
      <p className="mb-5 text-muted-foreground">
        Connect notes with <code>[[Note title]]</code>. Duplicate titles remain
        unresolved.
      </p>
      <Input
        className="max-w-sm"
        aria-label="Filter graph"
        placeholder="Find a note…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {error && (
        <p role="alert" className="mt-4 text-destructive">
          {error}
        </p>
      )}
      {data && visible.length > 0 && (
        <svg
          viewBox="0 0 720 540"
          role="img"
          aria-label="Wiki-link connections between active notes"
          className="my-4 w-full max-w-[800px]"
        >
          {data.edges.map((e, i) => {
            const from = positions.get(e.source);
            const to = positions.get(e.target);
            return from && to ? (
              <line
                key={`${e.source}:${e.target}:${i}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="var(--border)"
                strokeWidth={1.5}
              />
            ) : null;
          })}
          {visible.map((n) => {
            const point = positions.get(n.id)!;
            return (
              <a
                key={n.id}
                href={`/app/notes/${n.id}`}
                tabIndex={0}
                aria-label={`Open ${n.title}`}
              >
                <title>{n.title}</title>
                <circle cx={point.x} cy={point.y} r={6} fill="#a66b36" />
                <text
                  x={point.x}
                  y={point.y + 22}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--foreground)"
                >
                  {n.title.length > 21 ? `${n.title.slice(0, 20)}…` : n.title}
                </text>
              </a>
            );
          })}
        </svg>
      )}
      {filtered.length > 40 && (
        <p className="text-xs text-muted-foreground">
          The diagram shows the first 40 matching notes. All matching notes are
          listed below.
        </p>
      )}
      {data?.nodes.length === 0 && (
        <p className="py-12 text-muted-foreground">
          Create a note, then link it to another note to build your graph.
        </p>
      )}
      <ul className="mt-6 grid gap-2 border-t border-border pt-5 sm:grid-cols-2">
        {filtered.map((n) => (
          <li key={n.id}>
            <Link
              className="text-sm hover:underline"
              href={`/app/notes/${n.id}`}
            >
              {n.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
