CREATE TYPE "public"."actor_type" AS ENUM('PAYER', 'CONTACT', 'ADMIN', 'SYSTEM', 'PAYPAL');--> statement-breakpoint
CREATE TYPE "public"."ai_check_status" AS ENUM('NOT_RUN', 'NO_MATCH', 'MATCH', 'UNAVAILABLE');--> statement-breakpoint
CREATE TYPE "public"."ai_pattern" AS ENUM('EMERGENCY_OR_BAIL', 'IMPERSONATION', 'URGENCY_OR_SECRECY', 'GIFT_CARD_OR_CRYPTO', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."decision_type" AS ENUM('PAYER_CONFIRM', 'PAYER_CANCEL', 'APPROVE', 'DECLINE', 'SYSTEM_APPROVE');--> statement-breakpoint
CREATE TYPE "public"."flag_reason" AS ENUM('NEW_PAYEE', 'OVER_THRESHOLD', 'PAYER_UNSURE', 'AI_SCAM_PATTERN', 'AI_CHECK_UNAVAILABLE');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('PENDING', 'SENT', 'FAILED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('PAUSE_NOTICE', 'REVIEW_REQUEST', 'ESCALATION', 'REROUTE', 'OUTCOME', 'EXPIRY');--> statement-breakpoint
CREATE TYPE "public"."payment_state" AS ENUM('AWAITING_BUYER', 'AUTHORIZING', 'PENDING_REVIEW', 'ESCALATED', 'APPROVED', 'DECLINED', 'EXPIRED', 'CAPTURED', 'VOIDED', 'ABANDONED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."pending_operation" AS ENUM('AUTHORIZE', 'CAPTURE', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."recipient_type" AS ENUM('PAYER', 'CONTACT');--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"previous_state" "payment_state",
	"new_state" "payment_state",
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" uuid,
	"type" "decision_type" NOT NULL,
	"accepted" boolean NOT NULL,
	"rejection_reason" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decision_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid,
	"recipient_type" "recipient_type" NOT NULL,
	"recipient_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "notification_status" DEFAULT 'PENDING' NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "payee" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payer_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"email_normalized" text,
	"paypal_account" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"paypal_account" text,
	"threshold_minor" integer DEFAULT 20000 NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"timezone" text DEFAULT 'Europe/Rome' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payer_threshold_positive" CHECK ("payer"."threshold_minor" > 0),
	CONSTRAINT "payer_currency_eur" CHECK ("payer"."currency" = 'EUR')
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payer_id" uuid NOT NULL,
	"payee_id" uuid NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"note" text,
	"pasted_message" text,
	"payer_unsure" boolean DEFAULT false NOT NULL,
	"flagged" boolean NOT NULL,
	"flagged_reasons" "flag_reason"[] DEFAULT '{}' NOT NULL,
	"ai_check_status" "ai_check_status" DEFAULT 'NOT_RUN' NOT NULL,
	"ai_pattern_label" "ai_pattern",
	"ai_evidence" text,
	"state" "payment_state" DEFAULT 'AWAITING_BUYER' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"paypal_order_id" text,
	"paypal_authorization_id" text,
	"paypal_capture_id" text,
	"order_request_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"authorize_request_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"capture_request_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"void_request_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"pending_operation" "pending_operation",
	"pending_operation_at" timestamp with time zone,
	"payer_confirmed_at" timestamp with time zone,
	"review_opened_at" timestamp with time zone,
	"escalation_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"explanation_text" text,
	"brief_text" text,
	"is_seed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_paypal_order_id_unique" UNIQUE("paypal_order_id"),
	CONSTRAINT "payment_paypal_authorization_id_unique" UNIQUE("paypal_authorization_id"),
	CONSTRAINT "payment_paypal_capture_id_unique" UNIQUE("paypal_capture_id"),
	CONSTRAINT "payment_amount_range" CHECK ("payment"."amount_minor" > 0 and "payment"."amount_minor" <= 10000000),
	CONSTRAINT "payment_currency_eur" CHECK ("payment"."currency" = 'EUR'),
	CONSTRAINT "payment_flagged_matches_reasons" CHECK ("payment"."flagged" = (cardinality("payment"."flagged_reasons") > 0)),
	CONSTRAINT "payment_ai_evidence_len" CHECK ("payment"."ai_evidence" is null or char_length("payment"."ai_evidence") <= 160),
	CONSTRAINT "payment_pending_has_time" CHECK (("payment"."pending_operation" is null) = ("payment"."pending_operation_at" is null))
);
--> statement-breakpoint
CREATE TABLE "trusted_contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email_normalized" text NOT NULL,
	"paypal_account" text,
	"priority" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_payer_priority" UNIQUE("payer_id","priority"),
	CONSTRAINT "contact_priority_1_or_2" CHECK ("trusted_contact"."priority" in (1, 2))
);
--> statement-breakpoint
CREATE TABLE "webhook_event" (
	"paypal_event_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"resource_id" text,
	"payment_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision" ADD CONSTRAINT "decision_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payee" ADD CONSTRAINT "payee_payer_id_payer_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."payer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_payer_id_payer_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."payer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_payee_id_payee_id_fk" FOREIGN KEY ("payee_id") REFERENCES "public"."payee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_contact" ADD CONSTRAINT "trusted_contact_payer_id_payer_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."payer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_event" ADD CONSTRAINT "webhook_event_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_event_payment_idx" ON "audit_event" USING btree ("payment_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_pending_operation_idx" ON "payment" USING btree ("pending_operation_at") WHERE "payment"."pending_operation" is not null;--> statement-breakpoint
CREATE INDEX "payment_payer_state_idx" ON "payment" USING btree ("payer_id","state");