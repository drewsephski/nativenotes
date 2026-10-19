CREATE TABLE "note_create_requests" (
	"request_key" text PRIMARY KEY NOT NULL,
	"request_hash" text NOT NULL,
	"tenant_id" text NOT NULL,
	"note_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_budgets" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_mcp_policy" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"require_review" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauth_grant_tenant" ADD COLUMN "token_version" integer DEFAULT 0 NOT NULL;