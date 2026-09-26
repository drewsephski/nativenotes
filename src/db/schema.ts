import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const notes = pgTable(
  "notes",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("notes_tenant_id_idx").on(table.tenantId)],
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
