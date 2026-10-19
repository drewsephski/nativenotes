ALTER TABLE "note_proposals" ADD COLUMN "request_key" text;--> statement-breakpoint
ALTER TABLE "note_proposals" ADD COLUMN "request_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX "note_proposals_request_unique" ON "note_proposals" USING btree ("tenant_id","note_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "note_proposals_applied_unique" ON "note_proposals" USING btree ("tenant_id","note_id","applied_version");