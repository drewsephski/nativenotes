import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  primaryKey,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const folders = pgTable(
  "folders",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    parentId: text("parent_id"),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("folders_tenant_id_unique").on(t.tenantId, t.id),
    index("folders_parent_idx").on(t.tenantId, t.parentId, t.position),
    foreignKey({
      columns: [t.tenantId, t.parentId],
      foreignColumns: [t.tenantId, t.id],
      name: "folders_parent_tenant_fk",
    }),
    check(
      "folders_not_self_parent",
      sql`${t.parentId} IS NULL OR ${t.parentId} <> ${t.id}`,
    ),
  ],
);

export const notes = pgTable(
  "notes",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    folderId: text("folder_id"),
    summary: text("summary"),
    favorited: boolean("favorited").notNull().default(false),
    freshness: text("freshness", {
      enum: ["current", "needs_review", "superseded"],
    })
      .notNull()
      .default("current"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    trashedAt: timestamp("trashed_at", { withTimezone: true }),
    purgeAfter: timestamp("purge_after", { withTimezone: true }),
    createdByUserId: text("created_by_user_id"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("notes_tenant_id_idx").on(t.tenantId),
    uniqueIndex("notes_tenant_id_unique").on(t.tenantId, t.id),
    index("notes_folder_idx").on(t.tenantId, t.folderId),
    foreignKey({
      columns: [t.tenantId, t.folderId],
      foreignColumns: [folders.tenantId, folders.id],
      name: "notes_folder_tenant_fk",
    }),
    check(
      "notes_freshness_check",
      sql`${t.freshness} IN ('current', 'needs_review', 'superseded')`,
    ),
    check(
      "notes_trash_check",
      sql`(${t.trashedAt} IS NULL) = (${t.purgeAfter} IS NULL)`,
    ),
  ],
);

export const oauthGrantTenant = pgTable(
  "oauth_grant_tenant",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    oauthClientId: text("oauth_client_id").notNull(),
    organizationId: text("organization_id").notNull(),
    resource: text("resource").notNull(),
    scopes: text("scopes").array().notNull(),
    stableGrantIdentifier: text("stable_grant_identifier").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("oauth_grant_tenant_stable_grant_idx").on(
      table.stableGrantIdentifier,
    ),
    index("oauth_grant_tenant_lookup_idx").on(
      table.userId,
      table.oauthClientId,
      table.organizationId,
    ),
  ],
);

export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
export type OAuthGrantTenant = typeof oauthGrantTenant.$inferSelect;

export const tags = pgTable(
  "tags",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("tags_tenant_id_unique").on(t.tenantId, t.id),
    uniqueIndex("tags_name_unique").on(t.tenantId, t.normalizedName),
    check(
      "tags_normalized_check",
      sql`${t.normalizedName} = lower(trim(${t.name})) AND length(${t.normalizedName}) > 0`,
    ),
  ],
);

export const noteTags = pgTable(
  "note_tags",
  {
    tenantId: text("tenant_id").notNull(),
    noteId: text("note_id").notNull(),
    tagId: text("tag_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.noteId, t.tagId] }),
    index("note_tags_tag_idx").on(t.tenantId, t.tagId),
    foreignKey({
      columns: [t.tenantId, t.noteId],
      foreignColumns: [notes.tenantId, notes.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.tenantId, t.tagId],
      foreignColumns: [tags.tenantId, tags.id],
    }).onDelete("cascade"),
  ],
);

export const instructions = pgTable(
  "instructions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    scopeType: text("scope_type", { enum: ["workspace", "folder"] }).notNull(),
    folderId: text("folder_id"),
    instructions: text("instructions").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("instructions_workspace_unique")
      .on(t.tenantId)
      .where(sql`${t.folderId} IS NULL`),
    uniqueIndex("instructions_folder_unique")
      .on(t.tenantId, t.folderId)
      .where(sql`${t.folderId} IS NOT NULL`),
    foreignKey({
      columns: [t.tenantId, t.folderId],
      foreignColumns: [folders.tenantId, folders.id],
    }),
    check(
      "instructions_scope_check",
      sql`(${t.scopeType} = 'workspace' AND ${t.folderId} IS NULL) OR (${t.scopeType} = 'folder' AND ${t.folderId} IS NOT NULL)`,
    ),
  ],
);

// Immutable content snapshots. Version is the version of the saved content.
export const noteRevisions = pgTable(
  "note_revisions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    noteId: text("note_id").notNull(),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    summary: text("summary"),
    authorUserId: text("author_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("note_revisions_version_unique").on(
      t.tenantId,
      t.noteId,
      t.version,
    ),
    foreignKey({
      columns: [t.tenantId, t.noteId],
      foreignColumns: [notes.tenantId, notes.id],
    }).onDelete("cascade"),
  ],
);
