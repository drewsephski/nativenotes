import { useMemo } from "react";
import { diffLines } from "diff";

export function ContentDiff({
  before,
  after,
  label,
}: {
  before: string;
  after: string;
  label: string;
}) {
  // Bound worst-case work for unrelated, large notes. Never hide content on fallback.
  const changes = useMemo(
    () => diffLines(before, after, { timeout: 100 }),
    [before, after],
  );
  return (
    <section aria-label={`${label} diff`} className="min-w-0">
      <h3 className="mb-2 font-medium">{label}</h3>
      {before === after ? (
        <p className="text-sm text-muted-foreground">Unchanged</p>
      ) : !changes ? (
        <>
          <p className="text-sm text-muted-foreground">
            Detailed diff unavailable for this change. Full content follows.
          </p>
          <h4>Before</h4>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap">
            {before}
          </pre>
          <h4>After</h4>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap">
            {after}
          </pre>
        </>
      ) : (
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded border border-border p-3 font-mono text-xs leading-6">
          {changes.map((change, index) => {
            const lines = change.value.split("\n");
            if (lines.at(-1) === "") lines.pop();
            const changed = change.added || change.removed;
            const leading = index === 0;
            const trailing = index === changes.length - 1;
            const head = leading ? 0 : 2;
            const tail = trailing ? 0 : 2;
            return (
              <span key={index}>
                {lines.map((line, i) => {
                  if (
                    !changed &&
                    lines.length > head + tail &&
                    i >= head &&
                    i < lines.length - tail
                  ) {
                    return i === head ? (
                      <span key={i} className="block text-muted-foreground">
                        … {lines.length - head - tail} unchanged lines
                      </span>
                    ) : null;
                  }
                  return (
                    <span
                      key={i}
                      className={`block ${change.removed ? "bg-red-50 text-red-900" : change.added ? "bg-green-50 text-green-900" : "text-muted-foreground"}`}
                    >
                      {change.removed ? "− " : change.added ? "+ " : "  "}
                      {line}
                      {changed &&
                        i === lines.length - 1 &&
                        !change.value.endsWith("\n") && (
                          <span className="text-muted-foreground">
                            {" "}
                            (no final newline)
                          </span>
                        )}
                    </span>
                  );
                })}
              </span>
            );
          })}
        </pre>
      )}
    </section>
  );
}
