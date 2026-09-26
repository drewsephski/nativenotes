CREATE TABLE "folders" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "folders_not_self_parent" CHECK ("folders"."parent_id" IS NULL OR "folders"."parent_id" <> "folders"."id")
);
--> statement-breakpoint
CREATE TABLE "instructions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"scope_type" text NOT NULL,
	"folder_id" text,
	"instructions" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instructions_scope_check" CHECK (("instructions"."scope_type" = 'workspace' AND "instructions"."folder_id" IS NULL) OR ("instructions"."scope_type" = 'folder' AND "instructions"."folder_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "note_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"note_id" text NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"summary" text,
	"author_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_tags" (
	"tenant_id" text NOT NULL,
	"note_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "note_tags_tenant_id_note_id_tag_id_pk" PRIMARY KEY("tenant_id","note_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_normalized_check" CHECK ("tags"."normalized_name" = lower(trim("tags"."name")) AND length("tags"."normalized_name") > 0)
);
--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "folder_id" text;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "favorited" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "freshness" text DEFAULT 'current' NOT NULL;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "trashed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "purge_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "created_by_user_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "folders_tenant_id_unique" ON "folders" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE INDEX "folders_parent_idx" ON "folders" USING btree ("tenant_id","parent_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "instructions_workspace_unique" ON "instructions" USING btree ("tenant_id") WHERE "instructions"."folder_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "instructions_folder_unique" ON "instructions" USING btree ("tenant_id","folder_id") WHERE "instructions"."folder_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "note_revisions_version_unique" ON "note_revisions" USING btree ("tenant_id","note_id","version");--> statement-breakpoint
CREATE INDEX "note_tags_tag_idx" ON "note_tags" USING btree ("tenant_id","tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_tenant_id_unique" ON "tags" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_name_unique" ON "tags" USING btree ("tenant_id","normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "notes_tenant_id_unique" ON "notes" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE INDEX "notes_folder_idx" ON "notes" USING btree ("tenant_id","folder_id");--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_freshness_check" CHECK ("notes"."freshness" IN ('current', 'needs_review', 'superseded'));--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_trash_check" CHECK (("notes"."trashed_at" IS NULL) = ("notes"."purge_after" IS NULL));--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_parent_tenant_fk" FOREIGN KEY ("tenant_id","parent_id") REFERENCES "public"."folders"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructions" ADD CONSTRAINT "instructions_tenant_id_folder_id_folders_tenant_id_id_fk" FOREIGN KEY ("tenant_id","folder_id") REFERENCES "public"."folders"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_revisions" ADD CONSTRAINT "note_revisions_tenant_id_note_id_notes_tenant_id_id_fk" FOREIGN KEY ("tenant_id","note_id") REFERENCES "public"."notes"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_tags" ADD CONSTRAINT "note_tags_tenant_id_note_id_notes_tenant_id_id_fk" FOREIGN KEY ("tenant_id","note_id") REFERENCES "public"."notes"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_tags" ADD CONSTRAINT "note_tags_tenant_id_tag_id_tags_tenant_id_id_fk" FOREIGN KEY ("tenant_id","tag_id") REFERENCES "public"."tags"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_folder_tenant_fk" FOREIGN KEY ("tenant_id","folder_id") REFERENCES "public"."folders"("tenant_id","id") ON DELETE no action ON UPDATE no action;
