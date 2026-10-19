# Agent proposal loop

NativeNotes supports capture → MCP search → read → propose → human diff review → save → retrieve. This extends the existing notes service; no new runtime is required.

## Agent usage

Authorize the canonical `/mcp` endpoint with `mcp:read mcp:propose` for review-only edits to existing notes. Capture new notes in the web app. Use `mcp:read mcp:write` only when direct creation, updates, and lifecycle changes are intended. `mcp:instructions` is only needed for instruction changes. Existing read-only grants must be reauthorized for writes.

1. Capture with `note.create` (or the web Inbox).
2. Discover with `note.search` or `note.list`. Both now return metadata without bodies, `hasMore`, and `nextOffset`. Use `limit` (1–100) and `offset`. Refresh client tool schemas after deployment. Listing defaults to active notes; existing lifecycle filters remain available. Offset pagination can shift when concurrent edits reorder notes; restart discovery if needed.
3. Read with `note.get` to obtain full content and its current version.
4. Call `note.proposeUpdate`, for example:

   ```json
   {
     "id": "note-id-from-note.get",
     "expectedVersion": 1,
     "idempotencyKey": "architecture-decision-abc123",
     "title": "Project architecture",
     "body": "## Decision\n\nUse tenant-scoped authorization.",
     "reason": "Record the verified architecture decision",
     "source": "repository commit or source reference"
   }
   ```

   This stores a proposal and its exact baseline without editing the note. Omitted summary preserves the baseline summary; explicit null removes it. The source is submitted context, not independently verified evidence. User and OAuth client attribution come from server-verified identity, never tool input.
5. Open the note in the web app and choose **Agent changes**. Select a proposal, inspect its source, identity, title/summary/content diff, and accept or reject. The line diff separates independent changes and collapses long unchanged spans with surrounding context. Very expensive diffs fall back to labeled full before/after content. Proposals are listed in pages of 20.
6. Another authorized agent can use `proposal.get` / `proposal.list` to inspect the disposition and `note.get` to read the saved version.

MCP does not advertise acceptance or rejection. Those commands require a signed-in web session, current membership, trusted mutation origin, and matching active-workspace header. Only current workspace owners and admins can review; ordinary members cannot. The server derives this permission from current membership, never request input or OAuth claims. Existing direct `note.update` and lifecycle tools remain available under `mcp:write`. To require review for an agent, authorize only `mcp:read mcp:propose` and revoke any earlier write grants; adding proposal scope does not remove existing write authority. This is a grant-level control, not a mandatory workspace policy.

## Persistence and concurrency

Migration `0004_workable_lightspeed.sql` adds the proposal table. Migration `0005_late_krista_starr.sql` adds nullable request identity columns and unique indexes for retries and applied versions. Existing notes are not rewritten. Apply using the explicit migration command before deploying the backend; migration never runs on a request path.

Acceptance locks the proposal and note and commits content, immutable revision, reviewer, timestamp, and applied version in one transaction. A stale baseline, inactive note, duplicate review, or failed revision insert changes nothing. Stale proposals remain pending so they can be inspected/rejected; an agent must reread and submit a fresh proposal rather than overwrite newer work. Concurrent reviews commit at most once. The web app also blocks acceptance while a local editor is open.

Requests with the same idempotency key are scoped to the workspace, note, proposing user, and verified OAuth client. An exact retry returns the original proposal even after review or a version change; reusing the key with different input returns `idempotency_conflict`. Without a key, identical payloads are automatically deduplicated. Omitted summary and explicit null are distinct inputs. Historical proposals created before migration 0005 cannot be deduplicated against new requests.

Each note permits at most 20 unexpired pending proposals. Proposals expire for acceptance after 30 days and stop counting toward that limit; they remain inspectable and rejectable. A fresh proposal requires a fresh key and a current note read. Proposal records, request identities and baselines are retained for the lifetime of the note to preserve review history and retry safety. There is no automatic audit-record purge. Permanent note deletion cascades proposals and revisions.

History joins each applied version to its originating proposal and exposes both proposer/client/source and human reviewer, including proposals accepted before migration 0005. The revision author remains the human who saved the change.

## Hardening verification

Backend and web lint, type checking, and production builds passed. The backend suite covers proposal-only dispatch, current reviewer roles, keyed and unkeyed retries, concurrent submission, changed-payload conflicts, pending limits, expiry, and revision attribution. Web tests cover separate diff hunks, newline changes, reviewer visibility, expired acceptance, and history attribution. Migration 0005 was applied only to TEST_DATABASE_URL. Collaborative browser snapshots timed out twice, and the fallback in-app browser was unavailable; no new live browser proof is claimed.

## Previous milestone verification

- Backend: 124 tests passed; includes real test-database proposal isolation, baseline preservation, stale versions, competing reviews, transactional rollback, inactive-note protection, MCP scopes, and all existing OAuth/security coverage.
- Expanded OAuth lifecycle: 10 tests passed after adding a real local authorization-code/PKCE write grant → MCP proposal → cookie-authenticated web acceptance → retrieval through a separate read grant. It checks workspace switching, verified client attribution, and unavailable MCP review tools. These are grants of the test harness client, not two different external client products.
- Web: 53 tests passed, including diff/source rendering, acceptance/rejection, stale-proposal handling, and draft protection.
- Backend/web lint, type checking, and production builds passed. Fresh web checkouts need `pnpm --filter web exec next typegen` before standalone type checking because the existing layout uses generated `LayoutProps`.
- Local collaborative browser: a dedicated account/workspace in the disposable test database captured and proposed a note, inspected the review on desktop and at 390×844, accepted on mobile, and retrieved version 2. Page width matched the 390px viewport; the diff had no horizontal overflow; no captured console errors. This browser fixture used a web-submitted proposal. Verified OAuth attribution is separately exercised by the lifecycle test.

Production was not migrated or deployed. Live ChatGPT/Claude Code/Cursor authorization and retrieval have not been verified by this change. The first milestone's two-client production proof remains outstanding.

## Live two-client acceptance

After migration and deployment, use a dedicated QA workspace while preserving existing data:

1. Authorize client A with read/write scopes, capture a distinctive project note, search/read it, and submit a sourced proposal.
2. Review the baseline diff in the web app and accept; record the reviewer, applied version, and revision history.
3. Independently authorize client B to the same workspace; retrieve the saved note and accepted proposal. Confirm content/version and workspace isolation.
4. Submit another proposal, edit the note elsewhere, and verify stale acceptance fails while preserving both the note and pending proposal.
5. Record client names, scopes, workspace, timestamps, and observed results. Do not substitute local harness tests for this proof.
