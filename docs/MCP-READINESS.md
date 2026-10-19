# MCP readiness and rollout

## Implemented

- **Connected apps** in Workspace & team shows the signed-in user's actual grants for the selected workspace, including client ID, scopes, authorization date and revocation state. Revocation requires confirmation and affects every scope variant for that user/client/workspace. It never revokes another member's grants or another workspace.
- Revocation atomically advances grant token versions, revokes matching access/refresh records and removes consent. Every MCP request checks the persisted binding and current membership. Fresh authorization-code exchanges can reconnect; old JWTs remain invalid after reconnection. Legacy tokens work only for bindings never revoked.
- Consent offers only subsets of the client's requested scopes. Read-and-propose is selected first when available; otherwise read-only is first. The client must request `mcp:propose` to offer review mode. Downscoping a new grant does not revoke an older broader grant.
- Owners/admins can require human review for the whole workspace. This removes direct MCP mutation tools and independently rejects their dispatch, including calls from clients with cached tool lists. Existing-note proposals remain available. Web capture/review continues to work. New workspaces preserve the previous direct-write behavior until this policy is enabled.
- Every MCP tool has a validated output schema, structured content, compatible JSON text and behavior annotations. Internal tenant and idempotency fields are stripped. Added note move/freshness/confirmation/history/revision restore and tag rename/merge/delete tools use the existing services, tenant checks and scopes. MCP cannot accept/reject proposals. History is paginated with limit/offset (20 by default, at most 50 snapshots).
- Optional `note.create.idempotencyKey` is scoped to tenant/user/client. The request identity, note and initial revision commit together; concurrent retries return the same ID. Changed payloads conflict. Keys remain after deletion so retries cannot recreate deleted notes. Without a key, creation remains non-idempotent; the tool annotation reflects this.
- Shared Postgres budgets allow 60 public auth POSTs per peer/minute and 120 authenticated MCP requests per user/workspace/client/minute. HTTP 429 includes Retry-After; budget outages fail closed. Only Vercel's trusted forwarded header is used on Vercel, otherwise the socket peer is used. Other reverse proxies need an explicitly trusted address strategy; never trust arbitrary X-Forwarded-For.
- Runtime database connections have a five-second connection timeout and twenty-second idle timeout. Repository transactions explicitly use SET LOCAL statement_timeout=10s and lock_timeout=3s, which is safe with transaction pooling. Startup options were tested and ignored by the pooled Neon connection, so they are not relied upon. Standalone reads use role/database defaults configured separately below.
- Every backend response includes a generated X-Request-Id; completion logs record method, path without query, status, duration and a slow flag at five seconds. No bodies, credentials or tokens are logged by this observer. HTTP request/header receive timeouts are 30/15 seconds. Browser product requests time out after 30 seconds. Session errors show retry controls instead of automatically sending an authenticated user to sign-in.

## Configuration and deployment order

Do not deploy the new backend before the additive migrations. `0005` remains a prerequisite for proposal retry/history fields; `0006` adds token versions, note-create retry identities, shared budgets and workspace policy. No notes are rewritten or deleted.

1. Verify the selected runtime database: `pnpm db:status` (read-only, compares migration hashes and reports effective timeout settings). In the disposable test branch use `NODE_ENV=test pnpm db:status`. Do not treat a local env file as proof of the provider's deployed configuration.
2. Review deployment IDs/commits for both Vercel projects and confirm their runtime database and canonical issuer/resource configuration against the release environment.
3. Apply reviewed migrations using the direct connection: `NODE_ENV=production pnpm db:migrate`.
4. Configure standalone-query defaults explicitly: `NODE_ENV=production pnpm db:configure-runtime --apply`. This sets only the runtime role in the configured database to statement_timeout=10s and lock_timeout=3s. Existing provider pool connections may need recycling before these defaults take effect. Re-run `pnpm db:status --require-timeouts` (fails if defaults are absent or too permissive) and verify actual values; do not assume ALTER ROLE changed an already-open connection. A separate migration role can keep longer DDL budgets. Reverse with ALTER ROLE ... IN DATABASE ... RESET statement_timeout / RESET lock_timeout if required.
5. Deploy the backend, then web, from the same reviewed source. Keep the public issuer at `https://nativenotes.app/api/auth` and resource at `https://nativenotes.app/mcp`.
6. Run `pnpm smoke:remote https://nativenotes.app` and `pnpm validate:chatgpt-cimd`; check sign-in, Connected apps, policy changes and proposal review in the browser. Refresh client tool catalogs/reconnect for new scopes.
7. Complete the independent-client acceptance below. Record provider deployment IDs, source commit, migration hashes, timestamps and client product names with the results.

`pnpm --filter web typecheck` now generates Next.js route types automatically.

## Independent-client acceptance

Authorize two different MCP client products independently to a **dedicated QA workspace**. Client A needs `mcp:read mcp:write mcp:propose`; client B needs `mcp:read`. Temporarily allow direct writes in that QA workspace for capture; enable mandatory review separately to verify enforcement. Supply short-lived access tokens through environment variables or a secret manager; never commit them or paste them into evidence.

Set `MCP_ACCEPTANCE_TOKEN_A`, `MCP_ACCEPTANCE_TOKEN_B` and a unique `MCP_ACCEPTANCE_RUN_ID`. Optional `MCP_ACCEPTANCE_URL` defaults to the public `/mcp`; `MCP_ACCEPTANCE_FILE` defaults to `/tmp/nativenotes-mcp-acceptance.json`.

1. `pnpm mcp:acceptance capture` creates a distinctive note with a retry key, searches it, reads it through client B and proposes replacement content through A. Reuse the run ID if capture is interrupted. The script rejects two grants of the same client ID. The access tokens are still validated by the MCP server; locally decoded client IDs are only for checking independent identities.
2. Follow the printed note URL. Inspect source/identity/baseline diff, then accept as a current owner/admin.
3. `pnpm mcp:acceptance verify` independently reads the accepted proposal, exact content/version and attributed revision through B, then records token-free evidence.
4. Enable mandatory review and confirm A's existing write grant cannot create/update/trash, while proposals still work. Disable only when deliberately allowing direct writes.
5. Verify a stale proposal cannot overwrite a concurrent web edit; reject it or reread/repropose.
6. Revoke A in Connected apps. Confirm existing access and refresh tokens fail, B still works, another workspace is unaffected, and reconnecting A does not restore old tokens.
7. Trash the dedicated QA note after recording results. No existing user notes should be modified.

The script supplies repeatable protocol-level checks using real client grants. It does not replace the initial client UI authorization, Google sign-in, client-side tool discovery/confirmation or human review. Full external-client product proof requires observing those steps too.

## Operations

Run `pnpm maintenance:budgets` daily from the deployment's existing scheduler; it removes at most 10,000 counters older than seven days per run. It never purges note/proposal audit history or creation retry identities. Repeat if a backlog exceeds the batch size. No scheduler is silently provisioned by this change.

Route the existing structured request logs to the deployment's monitoring system; alert on sustained 5xx rates, auth/session failures and slow requests. Request IDs identify backend invocations; platform failures before the backend starts may only have a provider request ID. Investigate these in Vercel/Neon logs rather than claiming application tests resolve every 504. Fixed-window limits protect shared app resources but do not replace edge protection against distributed anonymous traffic.

## Verified boundaries

The configured runtime database was inspected read-only on 2026-10-19: five migrations applied, with `0005` and `0006` absent. The disposable test database has all seven migration hashes. Production was not migrated or deployed by this implementation. New live authorization/retrieval through two external client products is still a release acceptance step.


## Implementation validation — 2026-10-19

- Backend suite: 141 tests passed, including real local OAuth revoke/access rejection/refresh rejection/reconnect/old-token rejection, transactional proposal review, scoped tools, concurrency, mandatory review dispatch and effective transaction-local timeouts. Consent/connection authorization and paginated attributed history are included.
- Web: 60 tests passed, including confirmed revocation, manager-only policy controls, server errors and session retry without redirect. Lint, type checks and production builds passed for both applications.
- Local browser against the disposable test database: signed in with a dedicated QA account, selected the QA workspace, loaded the actual persisted connection, enabled mandatory review, confirmed revocation and observed Revoked. Policy stayed enabled after navigation/reload. Desktop and 390×844 mobile layouts showed no horizontal overflow. This fixture connection was seeded; the local OAuth lifecycle test separately verifies real token revocation and reconnection. No new external-client production proof is claimed.
- Runtime-role defaults were configured only in the disposable test branch. Its existing provider pool still reported zero defaults; transaction-local 10s/3s settings were verified independently. Provider pool recycling and standalone-read verification remain explicit rollout checks.
