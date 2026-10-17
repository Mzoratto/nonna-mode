// The eight tables from context/architecture-context.md. Enums live here and
// are the single source for their TypeScript unions (`enum.enumValues`).
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const paymentState = pgEnum("payment_state", [
  "AWAITING_BUYER",
  "AUTHORIZING",
  "PENDING_REVIEW",
  "ESCALATED",
  "APPROVED",
  "DECLINED",
  "EXPIRED",
  "CAPTURED",
  "VOIDED",
  "ABANDONED",
  "FAILED",
]);
export const flagReason = pgEnum("flag_reason", [
  "NEW_PAYEE",
  "OVER_THRESHOLD",
  "PAYER_UNSURE",
  "AI_SCAM_PATTERN",
  "AI_CHECK_UNAVAILABLE",
]);
export const aiCheckStatus = pgEnum("ai_check_status", ["NOT_RUN", "NO_MATCH", "MATCH", "UNAVAILABLE"]);
export const aiPattern = pgEnum("ai_pattern", [
  "EMERGENCY_OR_BAIL",
  "IMPERSONATION",
  "URGENCY_OR_SECRECY",
  "GIFT_CARD_OR_CRYPTO",
  "OTHER",
]);
export const pendingOperation = pgEnum("pending_operation", ["AUTHORIZE", "CAPTURE", "VOID"]);
export const actorType = pgEnum("actor_type", ["PAYER", "CONTACT", "ADMIN", "SYSTEM", "PAYPAL"]);
export const decisionType = pgEnum("decision_type", [
  "PAYER_CONFIRM",
  "PAYER_CANCEL",
  "APPROVE",
  "DECLINE",
  "SYSTEM_APPROVE",
]);
export const recipientType = pgEnum("recipient_type", ["PAYER", "CONTACT"]);
export const notificationType = pgEnum("notification_type", [
  "PAUSE_NOTICE",
  "REVIEW_REQUEST",
  "ESCALATION",
  "REROUTE",
  "OUTCOME",
  "EXPIRY",
]);
export const notificationStatus = pgEnum("notification_status", ["PENDING", "SENT", "FAILED", "SKIPPED"]);

export type PaymentState = (typeof paymentState.enumValues)[number];
export type FlagReason = (typeof flagReason.enumValues)[number];
export type AiCheckStatus = (typeof aiCheckStatus.enumValues)[number];
export type AiPattern = (typeof aiPattern.enumValues)[number];
export type ActorType = (typeof actorType.enumValues)[number];
export type DecisionType = (typeof decisionType.enumValues)[number];

const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts("created_at").notNull().defaultNow();

export const payer = pgTable(
  "payer",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    paypalAccount: text("paypal_account"),
    thresholdMinor: integer("threshold_minor").notNull().default(20000),
    currency: text("currency").notNull().default("EUR"),
    timezone: text("timezone").notNull().default("Europe/Rome"),
    createdAt: createdAt(),
  },
  (t) => [
    check("payer_threshold_positive", sql`${t.thresholdMinor} > 0`),
    check("payer_currency_eur", sql`${t.currency} = 'EUR'`),
  ],
);

export const trustedContact = pgTable(
  "trusted_contact",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    payerId: uuid("payer_id").notNull().references(() => payer.id),
    name: text("name").notNull(),
    emailNormalized: text("email_normalized").notNull(),
    paypalAccount: text("paypal_account"),
    phone: text("phone"), // for "Call Luca" (tel: link)
    priority: integer("priority").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    check("contact_priority_1_or_2", sql`${t.priority} in (1, 2)`),
    unique("contact_payer_priority").on(t.payerId, t.priority),
  ],
);

export const payee = pgTable("payee", {
  id: uuid("id").primaryKey().defaultRandom(),
  payerId: uuid("payer_id").notNull().references(() => payer.id),
  displayName: text("display_name").notNull(),
  relationship: text("relationship"), // "Your son", "Lawyer" — shown under the name
  emailNormalized: text("email_normalized"),
  paypalAccount: text("paypal_account"),
  createdAt: createdAt(),
});

export const payment = pgTable(
  "payment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    payerId: uuid("payer_id").notNull().references(() => payer.id),
    payeeId: uuid("payee_id").notNull().references(() => payee.id),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull().default("EUR"),
    note: text("note"),
    pastedMessage: text("pasted_message"),
    payerUnsure: boolean("payer_unsure").notNull().default(false),
    flagged: boolean("flagged").notNull(),
    flaggedReasons: flagReason("flagged_reasons").array().notNull().default(sql`'{}'`),
    aiCheckStatus: aiCheckStatus("ai_check_status").notNull().default("NOT_RUN"),
    aiPatternLabel: aiPattern("ai_pattern_label"),
    aiEvidence: text("ai_evidence"),
    state: paymentState("state").notNull().default("AWAITING_BUYER"),
    version: integer("version").notNull().default(0),
    paypalOrderId: text("paypal_order_id").unique(),
    paypalAuthorizationId: text("paypal_authorization_id").unique(),
    paypalCaptureId: text("paypal_capture_id").unique(),
    // Stable operation keys (PayPal-Request-Id), fixed at row creation so retries reuse them.
    orderRequestId: uuid("order_request_id").notNull().defaultRandom(),
    authorizeRequestId: uuid("authorize_request_id").notNull().defaultRandom(),
    captureRequestId: uuid("capture_request_id").notNull().defaultRandom(),
    voidRequestId: uuid("void_request_id").notNull().defaultRandom(),
    pendingOperation: pendingOperation("pending_operation"),
    pendingOperationAt: ts("pending_operation_at"),
    payerConfirmedAt: ts("payer_confirmed_at"),
    reviewOpenedAt: ts("review_opened_at"),
    escalationAt: ts("escalation_at"),
    expiresAt: ts("expires_at"),
    explanationText: text("explanation_text"),
    briefText: text("brief_text"),
    isSeed: boolean("is_seed").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    // Up to €100,000.00: generous for a demo, and keeps sums far from integer overflow.
    check("payment_amount_range", sql`${t.amountMinor} > 0 and ${t.amountMinor} <= 10000000`),
    check("payment_currency_eur", sql`${t.currency} = 'EUR'`),
    check("payment_flagged_matches_reasons", sql`${t.flagged} = (cardinality(${t.flaggedReasons}) > 0)`),
    check("payment_ai_evidence_len", sql`${t.aiEvidence} is null or char_length(${t.aiEvidence}) <= 160`),
    check("payment_pending_has_time", sql`(${t.pendingOperation} is null) = (${t.pendingOperationAt} is null)`),
    index("payment_pending_operation_idx").on(t.pendingOperationAt).where(sql`${t.pendingOperation} is not null`),
    index("payment_payer_state_idx").on(t.payerId, t.state),
  ],
);

export const decision = pgTable(
  "decision",
  {
  id: uuid("id").primaryKey().defaultRandom(),
  paymentId: uuid("payment_id").notNull().references(() => payment.id),
  actorType: actorType("actor_type").notNull(),
  actorId: uuid("actor_id"),
  type: decisionType("type").notNull(),
  accepted: boolean("accepted").notNull(),
  rejectionReason: text("rejection_reason"),
  /** Optional note from a contact to the payer ("Mamma, I called Matteo…"). */
  message: text("message"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  createdAt: createdAt(),
  },
  (t) => [check("decision_message_len", sql`${t.message} is null or char_length(${t.message}) <= 500`)],
);

// Insert-only: a trigger (migration 0001) rejects UPDATE and DELETE.
export const auditEvent = pgTable(
  "audit_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentId: uuid("payment_id").references(() => payment.id),
    actorType: actorType("actor_type").notNull(),
    actorId: uuid("actor_id"),
    action: text("action").notNull(),
    previousState: paymentState("previous_state"),
    newState: paymentState("new_state"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_event_payment_idx").on(t.paymentId, t.createdAt)],
);

export const notification = pgTable("notification", {
  id: uuid("id").primaryKey().defaultRandom(),
  paymentId: uuid("payment_id").references(() => payment.id),
  recipientType: recipientType("recipient_type").notNull(),
  recipientId: uuid("recipient_id").notNull(),
  type: notificationType("type").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  status: notificationStatus("status").notNull().default("PENDING"),
  sentAt: ts("sent_at"),
  createdAt: createdAt(),
});

export const webhookEvent = pgTable("webhook_event", {
  paypalEventId: text("paypal_event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  resourceId: text("resource_id"),
  paymentId: uuid("payment_id").references(() => payment.id),
  receivedAt: ts("received_at").notNull().defaultNow(),
  processedAt: ts("processed_at"),
});
