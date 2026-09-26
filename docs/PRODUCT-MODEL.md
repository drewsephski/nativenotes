# NativeNotes knowledge model

Organization is the tenant. All product queries receive a verified tenant from the session or OAuth grant. The web workspace header is an equality precondition, never authority. Switching the web workspace does not modify MCP grant binding.

## Folders and tags

Folder counts are **direct active-note counts**, not recursive totals. Ordering is position, name, then ID. Folder create/move/archive operations serialize on a workspace advisory transaction lock before reading ancestors. This prevents reciprocal concurrent moves from creating cycles. Composite foreign keys enforce tenant-local parents and note placement. Folder archive affects the folder only: its notes stay in All Notes, and its descendants keep their state. Archived folders remain manageable in folder settings.

Tags normalize with PostgreSQL `lower(trim(name))` and have tenant-local unique names. Merge locks both tags in ID order, copies assignments with conflict handling, and removes the source in one transaction. Deleting a tag removes assignments, never notes.

## Content and history

Title, Markdown body and summary are versioned content. Content changes require the expected version; a row lock plus conditional update prevents lost updates. The initial snapshot, the baseline for legacy notes, and each subsequent content snapshot are persisted transactionally. Restore copies an immutable snapshot into a new content version; it never rewrites history. Legacy authors are unknown. A content edit sets freshness to needs_review and clears verification.

Folder placement, tags, favorites, archive/trash and freshness are metadata. They do not increment the content version or change the content updated time. Confirm still true records a verification time without editing content. Current without a verification time means unconfirmed. Trash retains the prior archive state: restoring a formerly archived note returns it to Archive. Purge-after is informational; there is no purge job or permanent-delete UI.

## Search and links

Search is parameterized literal ILIKE across title, body, summary, assigned tags and the directly containing folder. Normal searches exclude archived and trashed notes. Pages return at most 100 notes with offset pagination. There are no embeddings.

Wiki links use `[[title]]`, resolved case-insensitively within active notes of the current tenant. Duplicate titles remain unresolved rather than selecting arbitrarily. Fenced/inline code is excluded. Graph and backlinks are derived at read time, so rename/delete/archive do not leave stored cross-tenant edges. This is an intentionally basic syntax; aliases and heading anchors are not supported. Graph computation currently scans active note bodies and is suitable for small workspaces; indexing is a future scale improvement.

## Sharing

Public sharing is intentionally omitted from this release. No Share control or anonymous note route is exposed.
