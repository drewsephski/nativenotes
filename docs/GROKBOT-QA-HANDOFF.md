# Grokbot computer-use QA handoff — NativeNotes Google OAuth / ChatGPT

Production origin: `https://nativenotes.vercel.app`  
MCP resource: `https://nativenotes.vercel.app/mcp`  
Source checklist: [`docs/QA.md`](./QA.md)

## Mission

Use computer-use to exercise NativeNotes auth and ChatGPT OAuth continuation in production (and locally if needed). Prefer stable `data-testid` anchors from `docs/QA.md`. Do not rely on CSS class names.

## Hard constraints (do not break)

When fixing reproducible UI/auth bugs:

1. Preserve OAuth / CIMD / PKCE semantics.
2. Preserve grant-to-organization binding (consent selection binds the grant; not merely “active org”).
3. Keep Dynamic Client Registration (DCR) disabled (`registration_endpoint` must stay absent).
4. Preserve request-time membership checks on MCP tool calls.
5. After any code change, rerun:
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm build`
6. Do **not** implement folders, tags, search, revisions, or additional MCP tools.

## Stable anchors

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

1. Production has `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
2. Google Cloud OAuth client redirect URI exactly:
   `https://nativenotes.vercel.app/api/auth/callback/google`
3. ChatGPT custom MCP points at `https://nativenotes.vercel.app/mcp`.
4. Optional email/password test user for fallback cases.

## Required scenarios

Execute and record Pass/Fail for each:

### Auth

1. **Fresh Google signup** — `/sign-up` → Google → new account → session.
2. **Returning Google login** — `/sign-in` → same Google account → no duplicate user.
3. **Email/password fallback** — sign-up then sign-in with ≥8 char password.
4. **Invalid password** — error alert, no session.
5. **Cancelled Google OAuth** — deny/cancel on Google → safe NativeNotes error/return, no session.

### ChatGPT redirect / login / consent

1. ChatGPT custom MCP → `https://nativenotes.vercel.app/mcp`.
2. Land on NativeNotes sign-in with OAuth continuation (ChatGPT banner when from MCP).
3. Continue with Google → `accounts.google.com`.
4. Return to NativeNotes consent with ChatGPT client + original scopes/resource preserved (`oauth_query` must survive Google).
5. Select Organization A (or create workspace if zero orgs) → Approve.
6. Return to ChatGPT → tool scan → call `note.list` (Organization A only).

Critical fail: consent missing ChatGPT context, or ChatGPT never receives an authorization code.

### Workspace states

1. **Zero orgs** — create via `create-workspace`, then Approve available.
2. **One org** — selector shows it; Approve.
3. **Multiple orgs** — select A, Approve; grant binds to A.
4. After grant for A, switching active org to B must **not** change tenant on `note.list` (grant binding wins).

### Failure / invalid states

1. Expired/mutated OAuth query on Approve → clear error, no code.
2. Deny consent → access-denied style outcome to client.
3. Remove membership after grant → `note.list` rejected even if JWT unexpired.
4. Bad Google callback without state/code → error, not silent success.
5. Forged org id on consent POST → “Workspace unavailable” / 403.

### UI quality

1. Desktop ≥1200px — centered sparse monochrome cards; visible focus rings.
2. Mobile 375px — single column; Approve/Deny stack; no horizontal scroll.
3. Keyboard — Tab through Google/email/password/submit; consent select/Approve/Deny; Enter activates.
4. Focus-visible outlines on every interactive control.
5. Loading — Google navigates away (not blank stuck page); Approve leaves for ChatGPT.
6. Errors — `role="alert"`; no secrets/tokens in UI.

## Recording format

For each scenario:

- Scenario name
- Pass / Fail
- URL at failure
- Visible error text (no tokens/secrets)
- Whether `note.list` / tenant isolation was checked

## Fix policy

- Fix reproducible UI/auth bugs found during QA.
- Prefer minimal diffs that restore expected behavior.
- Never weaken CSRF/origin checks; if server-side auth forwards are needed, forward a trusted `Origin` (or Referer origin) to Better Auth.
- Do not add product features beyond auth/consent bugfixes.

## Suggested first probe

1. `GET https://nativenotes.vercel.app/sign-in` — polished UI, Google primary, email fallback.
2. Click `[data-testid="google-sign-in"]` — must reach `accounts.google.com` (not “Missing or null Origin”).
3. Stop before completing Google login if interactive account selection requires the human operator; hand off remaining ChatGPT steps to the operator when needed.
