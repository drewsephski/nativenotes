# Product parity release — 2026-09-26

Production: https://nativenotes.app

## Release identity

- Backend commit: `4cde3ea` (includes the separately completed branding work).
- Backend Vercel deployment: `dpl_WaeczCYQA6pfGXP6sjaAGGqaMjVf`, Ready, aliased to `nativenotes.vercel.app`.
- Web commit: `6fecbe5`.
- Web Vercel deployment: `dpl_5fu2FwALXhfuNDBV1byRN1yMiZUw`, Ready, aliased to `nativenotes.app`.
- Next.js remains the public surface; explicit same-origin rewrites proxy the root Node backend. No architecture or OAuth issuer change.
- Work is split into schema, services/APIs, navigation, document/history, graph/settings, MCP, QA, and live-QA fixes on `codex/product-parity`. These commits are local; no push or PR creation was performed in this pass.

## Migration and preservation

Drizzle `0003_melodic_odin.sql` is additive. It was generated, inspected, and applied to TEST_DATABASE_URL before integration tests. The production target was verified to match the runtime database via the direct/unpooled Neon endpoint and to differ from the test database.

Production migration was explicitly applied with `NODE_ENV=production pnpm db:migrate`; migration count advanced from 3 to 4. No migration runs during builds. Before/after SHA-256 over the ordered existing notes' IDs, tenants, titles, bodies, content versions and created/updated timestamps matched. Both pre-existing notes were preserved. The same digest was checked again after browser QA and still matched.

## Automated validation

| Command | Result |
| --- | --- |
| `pnpm lint` | Passed |
| `pnpm typecheck` | Passed |
| `pnpm test` | 118 passed across 15 files, including real DB/OAuth integration on TEST_DATABASE_URL |
| `pnpm build` | Passed |
| `pnpm --filter web lint` | Passed |
| `pnpm --filter web typecheck` | Passed |
| `pnpm --filter web test` | 50 passed across 8 files after live-QA fixes |
| `pnpm --filter web build` | Passed |
| `git diff --check` | Passed for release changes |
| `pnpm smoke:remote https://nativenotes.app` | Passed after final web deployment |

The backend suite covers cross-tenant foreign keys and repository access, concurrent reciprocal folder moves/cycles, tag uniqueness/merge, lifecycle/favorites, search, instruction hierarchy, transactional revisions and rollback, revision restore, freshness, wiki links and MCP scope enforcement. The OAuth lifecycle suite also verifies that a write grant stays bound to its consent tenant after a web workspace switch, stale writes fail, foreign-note writes fail, and membership removal blocks an unexpired writer token. Existing OAuth/CIMD tests remain green.

Remote smoke verified health, canonical issuer/resource, CIMD, RFC 9207, PKCE S256, JWKS, supported token authentication, absent DCR endpoint and anonymous MCP rejection.

## Production computer-use evidence

Dia was used with a separate, clearly labeled **Parity QA 2026-09-26** workspace. Two QA notes, two folders, one tag, and workspace/folder instruction records remain there for review. The active workspace was returned to Drew's Workspace. Temporary viewport overrides were reset.

| Scenario | Observed result |
| --- | --- |
| Workspace creation/switching | Created QA workspace; original notes absent there. Switching back while viewing a QA note produced `Note not found`. |
| Folders | Created root and nested child; moved child to root and back; collapsed/expanded hierarchy; placed a note in child; direct active count changed to 1. |
| Note detail | Created Markdown note; author, folder breadcrumbs, readable viewer, summary and inspector showed real values. |
| Editing/history | Saved content, inspected versions, restored version 1 into version 3, then restored version 2 into version 4; prior snapshots remained. |
| Conflict recovery | Two editors loaded version 4. First saved version 5; stale second save failed and retained draft. Reload latest showed version 5 with a preserved version-4 comparison draft. |
| Tags/favorites | Created and assigned tag; count and tag-filtered collection matched; favorited note appeared in Favorites. |
| Archive/Trash | Archived and found note in Archive; restored; moved to Trash, found it there, then restored. Active counts returned. |
| Freshness | Confirm still true displayed confirmation time without a content version change; subsequent content edit marked Needs review. |
| Search | Cmd+K opened dialog; tag query returned only matching note with summary/folder/time. Escape closed it. |
| Instructions | Saved workspace text and folder text; folder settings exposed inherited workspace instructions; text persisted on reopen. |
| Wiki links/graph | Two linked notes resolved Markdown links and backlinks; Graph showed real nodes with navigable note links. |
| Settings | Real organization name/slug/member role; real canonical MCP endpoint and truthful Enabled/client authorization description. |
| Mobile/tablet | 390×844 and 820×1180: document scroll width equaled viewport width; sidebar and inspector drawers worked; list→note and edit/cancel worked. |
| Keyboard | Cmd+K, Escape and modal focus restoration observed; closing metadata drawer restored focus to About. |
| Desktop | Warm light UI, 232px left sidebar and 256px inspector separated by thin rules; readable document width and restrained accent. |
| Browser errors | No captured console errors/warnings at completion. Expected HTTP conflict and not-found responses were visible product states. |

Live QA found and fixed two inherited defects: workspace creation left a dropdown menu active over the dialog, and relative timestamps used a fixed preview date. Regression tests cover both. The corrected workspace dialog was rechecked in production: accessible form, menu closed, Escape dismissal.

Automated coverage supplies the remaining destructive/concurrency/security cases; browser tag merge/deletion, every freshness option, folder archive/unarchive, network-loss simulation, and new Google sign-in were not replayed in this release pass. Real ChatGPT reauthorization with newly expanded write scopes was not performed. Isolated OAuth tests establish write behavior; this must not be reported as a new live ChatGPT write authorization. See [QA.md](./QA.md) and [GROKBOT-QA-HANDOFF.md](./GROKBOT-QA-HANDOFF.md) for the full follow-up matrix.

## Intentional limits

See [PRODUCT-MODEL.md](./PRODUCT-MODEL.md) for semantics. Public Share is omitted entirely. No embeddings, AI-generated summary, background purge, rich-text editor or force-layout graph was added. Graph/backlinks scan active note bodies at read time; the graph visualization shows up to 40 matching nodes, with an accessible note list. Lexical search uses safe parameterized ILIKE and offset pagination, suitable for the present workspace size. Dark mode is not exposed in this light-first release.

A separate active chat, **Replace native controls with shadcn**, began editing this same checkout after the tested parity commits. Its ongoing package/control changes are preserved and are outside this recorded deployment and validation baseline.
