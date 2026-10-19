CREATE TABLE "note_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"note_id" text NOT NULL,
	"expected_version" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"summary" text,
	"reason" text NOT NULL,
	"source" text NOT NULL,
	"proposed_by_user_id" text NOT NULL,
	"oauth_client_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp with time zone,
	"applied_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_proposals_version_check" CHECK ("note_proposals"."expected_version" > 0),
	CONSTRAINT "note_proposals_status_check" CHECK ("note_proposals"."status" IN ('pending', 'accepted', 'rejected')),
	CONSTRAINT "note_proposals_review_check" CHECK ((
      "note_proposals"."status" = 'pending' AND "note_proposals"."reviewed_by_user_id" IS NULL AND "note_proposals"."reviewed_at" IS NULL AND "note_proposals"."applied_version" IS NULL
    ) OR (
      "note_proposals"."status" IN ('accepted', 'rejected') AND "note_proposals"."reviewed_by_user_id" IS NOT NULL AND "note_proposals"."reviewed_at" IS NOT NULL
      AND (("note_proposals"."status" = 'accepted' AND "note_proposals"."applied_version" = "note_proposals"."expected_version" + 1 AND "note_proposals"."applied_version" IS NOT NULL)
        OR ("note_proposals"."status" = 'rejected' AND "note_proposals"."applied_version" IS NULL))
    ))
);
--> statement-breakpoint
ALTER TABLE "note_proposals" ADD CONSTRAINT "note_proposals_tenant_id_note_id_notes_tenant_id_id_fk" FOREIGN KEY ("tenant_id","note_id") REFERENCES "public"."notes"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_proposals_note_idx" ON "note_proposals" USING btree ("tenant_id","note_id","created_at");