#!/usr/bin/env node
/**
 * Operator helper for ChatGPT / CIMD proofs: insert one note per tenant.
 * Does not create OAuth clients or weaken auth. No secrets printed.
 *
 * Usage:
 *   pnpm tsx scripts/seed-proof-notes.ts <orgAId> [orgBId]
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import { db } from "../src/db/client.js";
import { notes } from "../src/db/schema.js";

export async function seedProofNotes(
  orgAId: string,
  orgBId?: string,
): Promise<void> {
  const rows = [
    {
      id: randomUUID(),
      tenantId: orgAId,
      title: "Organization A proof note",
      body: "Visible only when the OAuth grant is bound to Organization A.",
    },
  ];
  if (orgBId) {
    rows.push({
      id: randomUUID(),
      tenantId: orgBId,
      title: "Organization B proof note",
      body: "Visible only when the OAuth grant is bound to Organization B.",
    });
  }

  await db.insert(notes).values(rows);
  console.log(
    JSON.stringify(
      {
        seeded: rows.map((row) => ({
          id: row.id,
          tenantId: row.tenantId,
          title: row.title,
        })),
      },
      null,
      2,
    ),
  );
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const orgA = process.argv[2];
  const orgB = process.argv[3];
  if (!orgA) {
    console.error("Usage: pnpm tsx scripts/seed-proof-notes.ts <orgAId> [orgBId]");
    process.exit(2);
  }
  void seedProofNotes(orgA, orgB).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
