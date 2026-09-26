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
