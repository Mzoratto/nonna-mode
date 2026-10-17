ALTER TABLE "decision" ADD COLUMN "message" text;--> statement-breakpoint
ALTER TABLE "payee" ADD COLUMN "relationship" text;--> statement-breakpoint
ALTER TABLE "trusted_contact" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "decision" ADD CONSTRAINT "decision_message_len" CHECK ("decision"."message" is null or char_length("decision"."message") <= 500);