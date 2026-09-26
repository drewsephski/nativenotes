# NativeNotes Grokbot / computer-use QA checklist

Executable browser scenarios for automated computer-use agents (for example Grokbot). Prefer the stable `data-testid` anchors listed below. Do not rely on CSS class names.

Production origin: `https://nativenotes.app`

## Stable interaction anchors

| Anchor | Purpose |
| --- | --- |
| `data-testid="google-sign-in"` | Primary Google OAuth button |
| `data-testid="email-input"` | Email field |
| `data-testid="password-input"` | Password field |
| `data-testid="sign-in-submit"` | Email/password sign-in |
| `data-testid="sign-up-submit"` | Email/password sign-up |
| `data-testid="name-input"` | Sign-up name field |
| `data-testid="organization-select"` | Workspace selector on consent |
| `data-testid="consent-approve"` | Approve MCP connection |
| `data-testid="consent-deny"` | Deny / cancel connection |
| `data-testid="create-workspace"` | Workspace name field when creating |

## Prerequisites

1. Production has `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` set.
2. Google Cloud OAuth client allows redirect URI `https://nativenotes.app/api/auth/callback/google`.
3. ChatGPT custom MCP points at `https://nativenotes.app/mcp`.
4. Optional: email/password test user for fallback cases.

---

## Auth

### Fresh signup via Google

1. Open `https://nativenotes.app/sign-up`.
2. Click `[data-testid="google-sign-in"]`.
3. Complete Google account chooser / consent for a new email.
4. Expect redirect back to NativeNotes home or an OAuth continuation page.
5. Pass if session cookie is set and user is signed in.

### Returning Google sign-in

1. Open `https://nativenotes.app/sign-in`.
2. Click `[data-testid="google-sign-in"]`.
3. Choose the previously used Google account.
4. Pass if signed in without creating a second NativeNotes user for the same email.

### Email/password fallback

1. Open `/sign-up`.
2. Fill `[data-testid="name-input"]`, `[data-testid="email-input"]`, `[data-testid="password-input"]` (password ≥ 8 chars).
3. Click `[data-testid="sign-up-submit"]`.
4. Sign out if a sign-out control exists, or clear cookies, then open `/sign-in`.
5. Submit the same email/password via `[data-testid="sign-in-submit"]`.
6. Pass if signed in.

### Invalid password

1. Open `/sign-in`.
2. Enter a known email and wrong password.
3. Click `[data-testid="sign-in-submit"]`.
4. Pass if an error alert remains on the sign-in page and no session is created.

### Cancelled Google OAuth

1. Open `/sign-in`.
2. Click `[data-testid="google-sign-in"]`.
3. On Google’s page, cancel / deny.
4. Pass if NativeNotes shows an auth error or returns to a safe page without a session.

---

## ChatGPT connection

### Full happy path

1. In ChatGPT, start connecting the NativeNotes custom MCP server.
2. Expect browser redirect to NativeNotes authorize → `/sign-in` (with OAuth continuation banner mentioning ChatGPT when arriving from MCP).
3. Click `[data-testid="google-sign-in"]` and finish Google login.
4. Expect `/oauth/consent` with title containing “ChatGPT wants to connect to NativeNotes”.
5. If no workspace exists, enter a name in `[data-testid="create-workspace"]`, submit Create workspace, then continue.
6. Select Organization A in `[data-testid="organization-select"]`.
7. Click `[data-testid="consent-approve"]`.
8. Expect redirect back to ChatGPT.
9. In ChatGPT, wait for tool scan; confirm `note.list` is available.
10. Call `note.list`; pass if only Organization A notes are returned.

### OAuth continuation must survive Google

Critical invariant for the path above:

- ChatGPT → NativeNotes authorize → sign-in → Google → Google callback → consent
- Must not lose: `oauth_query`, PKCE state, resource, scopes, client identity

Fail if consent page has no ChatGPT client context, or ChatGPT never receives an authorization code.

---

## Organizations

### No org → create workspace

1. Use an account with zero workspaces.
2. Reach consent.
3. Confirm suggested name like “Ada's Workspace” or “Personal”.
4. Submit create via `[data-testid="create-workspace"]`.
5. Pass if the new workspace appears selected and Approve is available.
6. Do not expect the word `referenceId` anywhere in the UI.

### One org

1. Reach consent with a single workspace.
2. Confirm `[data-testid="organization-select"]` shows that workspace.
3. Approve.

### Multiple orgs

1. Reach consent with Organization A and Organization B listed.
2. Select A, approve.
3. Pass if grant binds to A.

### Choose A, switch active org to B, grant remains A

1. Complete grant for Organization A.
2. Outside this UI (DB/API/session), switch active organization to B.
3. Refresh the access token / call `note.list`.
4. Pass if tenant remains A (grant binding is not active-org).

---

## Failure states

### Expired OAuth query

1. Capture a consent URL, wait until the signed query expires (or mutate `exp`/`sig`).
2. Submit Approve.
3. Pass if consent fails with a clear error and does not issue a code.

### Cancelled consent

1. Reach consent with a valid OAuth query.
2. Click `[data-testid="consent-deny"]`.
3. Pass if redirected to the client with an access-denied style outcome (no successful ChatGPT connection).

### Removed membership

1. Create a grant for org A.
2. Remove the user from org A membership.
3. Call MCP `note.list` with the existing access token.
4. Pass if request is rejected even if JWT is unexpired.

### Bad callback

1. Open `https://nativenotes.app/api/auth/callback/google` without a valid state/code.
2. Pass if Better Auth returns an error page / redirect with error, not a silent success.

### Network / retry

1. During Google or consent, simulate a transient failure (offline briefly) then retry.
2. Pass if retrying Google or Approve does not create duplicate grants for the same client/org when the first attempt actually succeeded.

### Inaccessible workspace

1. On consent, if possible submit an organization id the user does not belong to (forged form POST).
2. Pass if rejected with “Workspace unavailable” / 403.

---

## UI

### Desktop

1. Viewport ≥ 1200px.
2. Sign-in, sign-up, and consent cards are centered, sparse, monochrome.
3. Focus rings are visible on Tab.

### Mobile width

1. Viewport 375px.
2. Forms remain single-column; Approve/Deny stack vertically.
3. No horizontal scroll on primary content.

### Keyboard navigation

1. Tab through Google button, email, password, submit.
2. On consent, Tab through workspace select, Approve, Deny.
3. Enter activates focused buttons.

### Focus states

1. Every interactive control shows a visible `:focus-visible` outline.

### Loading states

1. After clicking Google, browser navigates to Google (no stuck blank NativeNotes page).
2. After Approve, browser leaves consent for ChatGPT callback.

### Error states

1. Invalid email/password shows an alert with `role="alert"`.
2. Consent errors show a status page or inline alert without leaking secrets.

---

## Pass / fail recording

For each scenario, record:

- Scenario name
- Pass / Fail
- URL at failure
- Visible error text (no tokens/secrets)
- Whether `note.list` / tenant isolation was checked

## Product parity release — required browser scenarios

Use **Dia** when available. Test the real deployed application, not mocked fixtures. Use roles, accessible names and URLs for the product UI. Create clearly labeled QA notes/folders; preserve existing user content. Mark each scenario Passed, Failed or Not exercised with evidence and the deployment identifier.

| Area | Computer-use procedure | Expected result |
| --- | --- | --- |
| Navigation | Visit All Notes, Inbox, Favorites, Folders, Tags, AI Instructions, Graph, Archive, Trash and Workspace & team | Every visible control works. Sidebar is left, light and approximately 232px. Counts reflect persisted state. |
| Folders | Create root and child; collapse/expand; rename; move child between parents; change sort position | Tree and filtered collection update. Counts mean directly contained active notes. Self/descendant parents are unavailable and rejected by API. |
| Folder archive | Archive parent and restore it from Folders | Notes remain in All Notes. Descendants remain accessible. No permanent folder deletion. |
| Notes | New note → Markdown/summary → create → Edit → Save; edit again → Cancel | Viewer renders content and summary; cancel retains last saved content; version increments only on content save. |
| Drafts | Edit a note, navigate away and return in the same tab | Unsaved draft is retained for that user/workspace/note. Cancel explicitly discards it. |
| Conflicts | Open same note in two tabs; save first, save stale second | Second save fails; draft stays intact. Reload latest preserves old draft for comparison. No silent retry or overwrite. |
| Metadata | Move note to nested folder; verify breadcrumbs, Created, Updated, Version and author | Actual persisted values; unknown authors are identified honestly. |
| Tags | Create/assign/remove tag; rename it; merge into another assigned tag; delete tag after confirmation | Tenant-local unique names, correct counts, no duplicate assignments, no note deletion. Click tag to filter notes. |
| Favorites | Toggle star from document and inspector, visit Favorites | Immediate state and persisted filtered result agree after reload. |
| Archive | Archive note, visit All Notes and Archive, restore | Hidden from active collections, visible in Archive, restoration works. |
| Trash | Trash an archived note; inspect retention date; restore | Hidden from active/Archive views; restored to its previous archived state. No hard-delete or purge control. |
| Search | Cmd/Ctrl+K; search title/body/summary/tag/folder; press Escape | Matching notes, snippets, folder and updated time; focus remains in dialog and returns on close. No results from other workspace. |
| Instructions | Save workspace rules; save parent and child folder rules in folder settings | Reload persists text; inheritance order workspace → ancestors → current folder is explicit. |
| History | Save twice, open History, inspect earlier snapshot, restore | New content version and new revision; old revisions remain unchanged. |
| Freshness | Select Needs review/Superseded; Confirm still true | Real status/time persist without changing body/version. A later content edit clears confirmation. |
| Wiki links | Link `[[Exact title]]`; inspect target backlinks and Graph | Same-workspace active note resolves. Duplicate titles remain unresolved. Code blocks do not create links. Click graph node to open note. |
| Settings | Inspect workspace name/slug/team; owner updates a disposable workspace name | Real organization data. MCP endpoint says Enabled, never claims a particular client is connected. |
| Workspace safety | Switch A→B during loads and with draft; test a stale tab after switch | No A content flashes in B. Stale workspace requests fail. Drafts remain scoped to user/workspace. |
| Mobile/tablet | Test ~390px, 768px, 1024px and desktop; use sidebar and About sheets | No horizontal overflow. Notes list → document navigation, working dialogs, reachable inspector and focus controls. |
| Keyboard | Tab/Shift+Tab through sidebar, folders, list, edit form and dialogs; Escape closes overlays | Visible focus, semantic labels, focus containment/restoration, all operations reachable. |
| Errors | Invalid name, duplicate tag, missing note, stale version, network loss and revoked membership | Clear error, no false success, preserved draft, retry where applicable. |

### MCP product proof

Existing read-only grants remain read-only. A new explicitly consented `mcp:write` grant is required for note/folder/tag mutations; `mcp:instructions` is required for `instructions.set`. Browser QA must not expand a real client's permissions without the user's action/approval. Run automated OAuth write tests against TEST_DATABASE_URL for repeatable write proof.

1. With read-only grant, list/get/search notes, list folders/tags and retrieve inherited instructions. A write must be unavailable/rejected.
2. With a disposable write grant, create/update/favorite/archive/trash/restore a note and create/update a folder; create/assign/remove tags.
3. Submit a stale `expectedVersion` and verify no overwrite or extra revision.
4. Switch the web active workspace and repeat the MCP write: grant tenant stays unchanged.
5. Remove membership; reads and writes must both fail even with an unexpired token.
6. Attempt foreign note/folder/tag IDs and forged tenant input: no cross-workspace read/write.
7. General write scope alone must not authorize `instructions.set`; instructions scope alone must not authorize note writes.

### Release gates

Run root lint/typecheck/test/build and web lint/typecheck/test/build. The root suite includes real database and OAuth integration tests and requires TEST_DATABASE_URL. Inspect/apply generated migration there before production. Production migration uses the unpooled Neon URL explicitly, never a build hook. Record a before/after aggregate of existing note content to verify preservation. Deploy backend before web, then run `pnpm smoke:remote https://nativenotes.app` and browser checks. Never weaken a failing isolation, cycle, revision transaction, scope, grant-binding or OAuth test to ship.
