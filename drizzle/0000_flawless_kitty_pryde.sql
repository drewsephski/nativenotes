CREATE TABLE "notes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_grant_tenant" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"oauth_client_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"resource" text NOT NULL,
	"scopes" text[] NOT NULL,
	"stable_grant_identifier" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "notes_tenant_id_idx" ON "notes" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_grant_tenant_stable_grant_idx" ON "oauth_grant_tenant" USING btree ("stable_grant_identifier");--> statement-breakpoint
CREATE INDEX "oauth_grant_tenant_lookup_idx" ON "oauth_grant_tenant" USING btree ("user_id","oauth_client_id","organization_id");