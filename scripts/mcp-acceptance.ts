import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { decodeJwt } from "jose";
import { z } from "zod";
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";

// Run with independently authorized QA-client tokens in environment variables.
// No tokens are logged or written to the evidence file.
const stage = z.enum(["capture", "verify"]).parse(process.argv[2]);
const endpoint = new URL(
  process.env.MCP_ACCEPTANCE_URL ?? "https://nativenotes.app/mcp",
);
if (
  endpoint.protocol !== "https:" &&
  !["localhost", "127.0.0.1"].includes(endpoint.hostname)
)
  throw new Error("HTTPS required");
if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash)
  throw new Error("MCP URL must not contain credentials, query or fragment");
const tokenA = z.string().min(1).parse(process.env.MCP_ACCEPTANCE_TOKEN_A);
const tokenB = z.string().min(1).parse(process.env.MCP_ACCEPTANCE_TOKEN_B);
const clientA = z.string().min(1).parse(decodeJwt(tokenA).client_id);
const clientB = z.string().min(1).parse(decodeJwt(tokenB).client_id);
if (clientA === clientB)
  throw new Error(
    "Use tokens authorized by two different MCP client products, not two grants of the same client",
  );
const file =
  process.env.MCP_ACCEPTANCE_FILE ?? "/tmp/nativenotes-mcp-acceptance.json";
const meta = {
  [PROTOCOL_VERSION_META_KEY]: "2026-07-28",
  [CLIENT_INFO_META_KEY]: { name: "nativenotes-acceptance", version: "1" },
  [CLIENT_CAPABILITIES_META_KEY]: {},
};
async function rpc(
  token: string,
  method: string,
  params: Record<string, unknown>,
) {
  const response = await fetch(endpoint, {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": method,
      ...(typeof params.name === "string" ? { "Mcp-Name": params.name } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: randomUUID(),
      method,
      params: { ...params, _meta: meta },
    }),
  });
  if (!response.ok)
    throw new Error(`MCP ${method} returned HTTP ${response.status}`);
  const envelope = (await response.json()) as {
    error?: unknown;
    result?: {
      isError?: boolean;
      structuredContent?: unknown;
      content?: { text: string }[];
    };
  };
  if (envelope.error || envelope.result?.isError)
    throw new Error(`MCP ${method} failed; inspect the QA client for details`);
  return envelope.result;
}
async function call(
  token: string,
  name: string,
  args: Record<string, unknown>,
) {
  const result = await rpc(token, "tools/call", { name, arguments: args });
  return (
    result?.structuredContent ??
    JSON.parse(result?.content?.[0]?.text ?? "null")
  );
}
await rpc(tokenA, "server/discover", {});
await rpc(tokenB, "server/discover", {});
const evidenceSchema = z.object({
  endpoint: z.string(),
  clientA: z.string(),
  clientB: z.string(),
  noteId: z.string(),
  proposalId: z.string(),
  marker: z.string(),
  baselineVersion: z.number(),
});
if (stage === "capture") {
  // Supply a stable run ID when retrying an interrupted capture.
  const marker = z
    .string()
    .trim()
    .min(1)
    .max(100)
    .parse(process.env.MCP_ACCEPTANCE_RUN_ID);
  if (!marker?.trim())
    throw new Error(
      "Set a unique MCP_ACCEPTANCE_RUN_ID, and reuse it for retries",
    );
  const note = z
    .object({ id: z.string(), title: z.string(), version: z.number() })
    .parse(
      await call(tokenA, "note.create", {
        title: `MCP acceptance ${marker}`,
        body: `QA capture ${marker}`,
        idempotencyKey: `acceptance-${marker}`,
      }),
    );
  const found = await call(tokenA, "note.search", { query: marker, limit: 10 });
  if (!JSON.stringify(found).includes(note.id))
    throw new Error("Created note was not found by search");
  await call(tokenB, "note.get", { id: note.id });
  const proposal = z.object({ id: z.string() }).parse(
    await call(tokenA, "note.proposeUpdate", {
      id: note.id,
      expectedVersion: note.version,
      idempotencyKey: `proposal-${marker}`,
      title: note.title,
      body: `Human-reviewed QA content ${marker}`,
      reason: "Verify cross-client retrieval after human review",
      source: "NativeNotes two-client acceptance script",
    }),
  );
  await writeFile(
    file,
    JSON.stringify(
      {
        endpoint: endpoint.href,
        clientA,
        clientB,
        noteId: note.id,
        proposalId: proposal.id,
        marker,
        baselineVersion: note.version,
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  console.log(
    `Capture passed. Review and accept the proposal at ${endpoint.origin}/app/notes/${encodeURIComponent(note.id)}, then run pnpm mcp:acceptance verify. Evidence: ${file}`,
  );
} else {
  const evidence = evidenceSchema.parse(
    JSON.parse(await readFile(file, "utf8")),
  );
  if (
    evidence.endpoint !== endpoint.href ||
    evidence.clientA !== clientA ||
    evidence.clientB !== clientB
  )
    throw new Error("Evidence target/client mismatch");
  const proposal = z
    .object({
      status: z.literal("accepted"),
      appliedVersion: z.number(),
      reviewedByUserId: z.string(),
    })
    .parse(await call(tokenB, "proposal.get", { id: evidence.proposalId }));
  const note = z
    .object({ version: z.number(), body: z.string() })
    .parse(await call(tokenB, "note.get", { id: evidence.noteId }));
  if (
    proposal.appliedVersion !== evidence.baselineVersion + 1 ||
    note.version !== proposal.appliedVersion ||
    note.body !== `Human-reviewed QA content ${evidence.marker}`
  )
    throw new Error(
      "Retrieved content/version does not match the accepted proposal",
    );
  const history = await call(tokenB, "note.history", { id: evidence.noteId });
  if (!JSON.stringify(history).includes(evidence.proposalId))
    throw new Error("Revision attribution is missing");
  await writeFile(
    file,
    JSON.stringify(
      {
        ...evidence,
        verifiedAt: new Date().toISOString(),
        appliedVersion: proposal.appliedVersion,
        reviewer: proposal.reviewedByUserId,
        result: "passed",
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  console.log(
    `Two-client retrieval passed. Evidence: ${file}. Trash the dedicated QA note when finished.`,
  );
}
