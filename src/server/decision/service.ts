import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import {
  auditEvent,
  decision,
  notification,
  payee,
  payer,
  payment,
  type PaymentState,
  trustedContact,
} from "@/server/db/schema";
import { fallbackWording } from "@/server/explanations/fallback";
import { scamCheck } from "@/server/explanations/scamCheck";
import * as realPayPal from "@/server/paypal/client";
import { PayPalError } from "@/server/paypal/client";
import { afterPolicy, now } from "@/server/time";
import { isSelfDealing } from "./eligibility";
import { type AiCheck, computeReasons } from "./flagging";
import { Conflict, type Payment, transition, type TransitionInput } from "./transitions";

// The Decision Service: the ONLY code that initiates PayPal mutations.
// Pattern for every command: load → validate → one CAS commit → external call
// with the stored request ID → record only what PayPal confirms. A timeout
// leaves pending_operation set; reconcile() finishes it later.

export type PayPalPort = Pick<
  typeof realPayPal,
  "createOrder" | "getOrder" | "authorizeOrder" | "getAuthorization" | "captureAuthorization" | "voidAuthorization"
>;
let paypal: PayPalPort = realPayPal;
let checkScam: typeof scamCheck = scamCheck;
/** Tests only. */
export function setDeps(d: { paypal?: PayPalPort; scamCheck?: typeof scamCheck }) {
  if (d.paypal) paypal = d.paypal;
  if (d.scamCheck) checkScam = d.scamCheck;
}

export type DecisionErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "NOT_REVIEWABLE"
  | "EXPIRED"
  | "NOT_ROUTED"
  | "NEEDS_PAYER_CONFIRMATION"
  | "STALE";
export class DecisionError extends Error {
  constructor(readonly code: DecisionErrorCode) {
    super(code);
  }
}

const REVIEW: PaymentState[] = ["PENDING_REVIEW", "ESCALATED"];
const MAX_ATTEMPTS = 3;
const SYSTEM = { type: "SYSTEM" } as const;
const baseUrl = () => process.env.APP_BASE_URL ?? "http://localhost:3000";

/** 4xx from PayPal = a definite answer. Anything else (5xx, timeout) = unknown. */
const definiteRefusal = (e: unknown) => e instanceof PayPalError && e.status >= 400 && e.status < 500;

async function load(paymentId: string): Promise<Payment> {
  const [p] = await db().select().from(payment).where(eq(payment.id, paymentId));
  if (!p) throw new DecisionError("NOT_FOUND");
  return p;
}

/** Run a load-validate-commit step, reloading and revalidating on a CAS conflict. */
async function retrying<T>(step: () => Promise<T>): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await step();
    } catch (e) {
      if (!(e instanceof Conflict) || i >= MAX_ATTEMPTS) throw e instanceof Conflict ? new DecisionError("STALE") : e;
    }
  }
}

const move = (p: Payment, t: Omit<TransitionInput, "paymentId" | "from" | "version">) =>
  transition(db(), { paymentId: p.id, from: p.state, version: p.version, ...t });

async function notify(
  paymentId: string,
  recipientType: "PAYER" | "CONTACT",
  recipientId: string,
  type: (typeof notification.$inferInsert)["type"],
) {
  // Idempotent per logical notice; delivery (Resend) is phase 3 and never rolls back a decision.
  await db()
    .insert(notification)
    .values({ paymentId, recipientType, recipientId, type, idempotencyKey: `${type}:${paymentId}:${recipientId}` })
    .onConflictDoNothing();
}

async function contactsOf(payerId: string) {
  return db()
    .select()
    .from(trustedContact)
    .where(and(eq(trustedContact.payerId, payerId), eq(trustedContact.active, true)))
    .orderBy(asc(trustedContact.priority));
}

// ---------------------------------------------------------------- send

export type SendInput = {
  payerId: string;
  payeeId: string;
  amountMinor: number;
  note?: string | null;
  pastedMessage?: string | null;
  payerUnsure: boolean;
};

export async function submitSend(input: SendInput): Promise<{ paymentId: string; approveUrl: string | undefined }> {
  const d = db();
  const [who] = await d.select().from(payer).where(eq(payer.id, input.payerId));
  const [to] = await d
    .select()
    .from(payee)
    .where(and(eq(payee.id, input.payeeId), eq(payee.payerId, input.payerId)));
  if (!who || !to) throw new DecisionError("FORBIDDEN");

  const [known] = await d
    .select({ id: payment.id })
    .from(payment)
    .where(and(eq(payment.payerId, who.id), eq(payment.payeeId, to.id), eq(payment.state, "CAPTURED")))
    .limit(1);
  const isNewPayee = !known;
  const text = [input.note, input.pastedMessage].filter((t) => t?.trim()).join("\n\n");
  // The AI check runs before the row exists; no PayPal call happens until after it is written.
  const ai: AiCheck = text ? await checkScam({ text, amountMinor: input.amountMinor, isNewPayee }) : { status: "NOT_RUN" };
  const reasons = computeReasons({
    isNewPayee,
    amountMinor: input.amountMinor,
    thresholdMinor: who.thresholdMinor,
    payerUnsure: input.payerUnsure,
    textPresent: Boolean(text),
    ai,
  });

  const row = await d.transaction(async (tx) => {
    const [r] = await tx
      .insert(payment)
      .values({
        payerId: who.id,
        payeeId: to.id,
        amountMinor: input.amountMinor,
        note: input.note?.trim() || null,
        pastedMessage: input.pastedMessage?.trim() || null,
        payerUnsure: input.payerUnsure,
        flagged: reasons.length > 0,
        flaggedReasons: reasons,
        aiCheckStatus: ai.status,
        aiPatternLabel: ai.status === "MATCH" ? ai.pattern : null,
        aiEvidence: ai.status === "MATCH" ? ai.evidence : null,
      })
      .returning();
    await tx.insert(auditEvent).values({
      paymentId: r!.id,
      actorType: "PAYER",
      actorId: who.id,
      action: "SEND_SUBMITTED",
      newState: "AWAITING_BUYER",
      details: { reasons, ai_check: ai.status, ai_pattern: ai.status === "MATCH" ? ai.pattern : null },
    });
    return r!;
  });

  // Fallback mapping (2026-10-16 proof): the app's merchant is the actual payee;
  // the recipient lives in our metadata only. Disclosed in the demo.
  const order = await paypal.createOrder({
    amountMinor: row.amountMinor,
    customId: row.id,
    returnUrl: `${baseUrl()}/paypal/return`,
    cancelUrl: `${baseUrl()}/payments/${row.id}`,
    requestId: row.orderRequestId,
  });
  await move(row, { to: "AWAITING_BUYER", actor: SYSTEM, action: "ORDER_CREATED", patch: { paypalOrderId: order.id } });
  return { paymentId: row.id, approveUrl: order.approveUrl };
}

/** Buyer came back from PayPal (return page or CHECKOUT.ORDER.APPROVED). Idempotent. */
export async function onBuyerApproved(paymentId: string): Promise<Payment> {
  const p = await load(paymentId);
  if (p.state !== "AWAITING_BUYER" || !p.paypalOrderId) return p;
  const o = await paypal.getOrder(p.paypalOrderId);
  if (o.status !== "APPROVED" && !o.authorization) return p;
  let started: Payment;
  try {
    started = await move(p, {
      to: "AUTHORIZING",
      actor: { type: "PAYPAL" },
      action: "BUYER_APPROVED",
      patch: { pendingOperation: "AUTHORIZE", pendingOperationAt: now() },
    });
  } catch (e) {
    if (e instanceof Conflict) return load(paymentId); // someone else is authorizing
    throw e;
  }
  return authorize(started);
}

async function authorize(p: Payment): Promise<Payment> {
  const orderId = p.paypalOrderId!;
  // Read first: a previous attempt may already have authorized (no duplicate authorize).
  let auth = (await paypal.getOrder(orderId)).authorization;
  if (!auth) {
    try {
      auth = (await paypal.authorizeOrder(orderId, p.authorizeRequestId)).authorization;
    } catch (e) {
      if (!definiteRefusal(e)) throw e; // unknown: pending stays, reconcile later
      return move(p, {
        to: "FAILED",
        actor: { type: "PAYPAL" },
        action: "AUTHORIZATION_DENIED",
        details: { paypal_error: (e as PayPalError).errorName ?? null },
        patch: { pendingOperation: null, pendingOperationAt: null },
      });
    }
  }
  if (!auth) return p;
  if (auth.status !== "CREATED") {
    return move(p, {
      to: "FAILED",
      actor: { type: "PAYPAL" },
      action: "AUTHORIZATION_DENIED",
      details: { authorization_status: auth.status },
      patch: { pendingOperation: null, pendingOperationAt: null },
    });
  }

  if (p.flagged) {
    const [who] = await db().select().from(payer).where(eq(payer.id, p.payerId));
    const [to] = await db().select().from(payee).where(eq(payee.id, p.payeeId));
    const words = fallbackWording({
      payerName: who!.name,
      payee: to!.displayName,
      amountMinor: p.amountMinor,
      thresholdMinor: who!.thresholdMinor,
      reasons: p.flaggedReasons,
      aiEvidence: p.aiEvidence,
    });
    const opened = now();
    const held = await move(p, {
      to: "PENDING_REVIEW",
      actor: { type: "PAYPAL" },
      action: "AUTHORIZATION_CONFIRMED_HELD",
      details: { authorization_expires: auth.expiration_time ?? null, explanation: words.explanation, brief: words.brief },
      patch: {
        paypalAuthorizationId: auth.id,
        pendingOperation: null,
        pendingOperationAt: null,
        reviewOpenedAt: opened,
        escalationAt: afterPolicy(opened, "escalate"),
        expiresAt: afterPolicy(opened, "expire"),
        explanationText: words.explanation,
        briefText: words.brief,
      },
    });
    const [first] = await contactsOf(p.payerId);
    await notify(p.id, "PAYER", p.payerId, "PAUSE_NOTICE");
    if (first) await notify(p.id, "CONTACT", first.id, "REVIEW_REQUEST");
    return held;
  }

  const approved = await move(p, {
    to: "APPROVED",
    actor: SYSTEM,
    action: "AUTHORIZATION_CONFIRMED_SYSTEM_APPROVED",
    decision: { type: "SYSTEM_APPROVE", idempotencyKey: `review-decision:${p.id}` },
    patch: { paypalAuthorizationId: auth.id, pendingOperation: "CAPTURE", pendingOperationAt: now() },
  });
  return capture(approved);
}

/** Capture only from APPROVED, with the stored request ID. */
async function capture(p: Payment): Promise<Payment> {
  if (p.state !== "APPROVED" || !p.paypalAuthorizationId) return p;
  let c: { id: string; status: string };
  try {
    c = await paypal.captureAuthorization(p.paypalAuthorizationId, p.captureRequestId);
  } catch (e) {
    if (!definiteRefusal(e)) throw e;
    const failed = await move(p, {
      to: "FAILED",
      actor: { type: "PAYPAL" },
      action: "CAPTURE_DENIED",
      details: { paypal_error: (e as PayPalError).errorName ?? null },
      patch: { pendingOperation: null, pendingOperationAt: null },
    });
    await releaseAfterFailedCapture(failed);
    return failed;
  }
  if (c.status === "COMPLETED") {
    const done = await move(p, {
      to: "CAPTURED",
      actor: { type: "PAYPAL" },
      action: "CAPTURE_CONFIRMED",
      patch: { paypalCaptureId: c.id, pendingOperation: null, pendingOperationAt: null },
    });
    await notify(p.id, "PAYER", p.payerId, "OUTCOME");
    return done;
  }
  if (c.status === "DECLINED" || c.status === "FAILED") {
    const failed = await move(p, {
      to: "FAILED",
      actor: { type: "PAYPAL" },
      action: "CAPTURE_DENIED",
      details: { capture_status: c.status },
      patch: { paypalCaptureId: c.id, pendingOperation: null, pendingOperationAt: null },
    });
    await releaseAfterFailedCapture(failed);
    return failed;
  }
  // PENDING: keep pending_operation; reconcile() checks again.
  return move(p, { to: "APPROVED", actor: { type: "PAYPAL" }, action: "CAPTURE_PENDING", patch: { paypalCaptureId: c.id } });
}

/** A denied capture leaves the authorization open; void it so money is not held. Best effort, audited. */
async function releaseAfterFailedCapture(p: Payment) {
  try {
    await paypal.voidAuthorization(p.paypalAuthorizationId!, p.voidRequestId);
    const a = await paypal.getAuthorization(p.paypalAuthorizationId!);
    await move(p, { to: "FAILED", actor: { type: "PAYPAL" }, action: "AUTHORIZATION_RELEASED", details: { authorization_status: a.status } });
  } catch {
    await move(p, { to: "FAILED", actor: SYSTEM, action: "AUTHORIZATION_RELEASE_UNCONFIRMED" });
  }
}

/** Void only from DECLINED or EXPIRED; record VOIDED only when PayPal shows it. */
async function voidPayment(p: Payment): Promise<Payment> {
  if ((p.state !== "DECLINED" && p.state !== "EXPIRED") || !p.paypalAuthorizationId) return p;
  try {
    await paypal.voidAuthorization(p.paypalAuthorizationId, p.voidRequestId);
  } catch (e) {
    if (!definiteRefusal(e)) throw e; // unknown: reconcile later
    // A refusal may mean "already voided/expired": the read below decides.
  }
  const a = await paypal.getAuthorization(p.paypalAuthorizationId);
  if (a.status !== "VOIDED" && a.status !== "EXPIRED") return p;
  const voided = await move(p, {
    to: "VOIDED",
    actor: { type: "PAYPAL" },
    action: "VOID_CONFIRMED",
    details: { authorization_status: a.status },
    patch: { pendingOperation: null, pendingOperationAt: null },
  });
  await notify(p.id, "PAYER", p.payerId, "OUTCOME");
  return voided;
}

// ---------------------------------------------------------------- payer

export async function confirmByPayer(payerId: string, paymentId: string): Promise<Payment> {
  return retrying(async () => {
    const p = await load(paymentId);
    if (p.payerId !== payerId) throw new DecisionError("FORBIDDEN");
    if (!REVIEW.includes(p.state)) throw new DecisionError("NOT_REVIEWABLE");
    if (p.payerConfirmedAt) return p; // repeated confirmation consumes nothing
    return move(p, {
      to: p.state,
      actor: { type: "PAYER", id: payerId },
      action: "PAYER_CONFIRMED",
      decision: { type: "PAYER_CONFIRM", idempotencyKey: `payer-confirm:${p.id}` },
      patch: { payerConfirmedAt: now() },
    });
  });
}

export async function cancelByPayer(payerId: string, paymentId: string): Promise<Payment> {
  const declined = await retrying(async () => {
    const p = await load(paymentId);
    if (p.payerId !== payerId) throw new DecisionError("FORBIDDEN");
    if (p.state === "AWAITING_BUYER") {
      return move(p, { to: "ABANDONED", actor: { type: "PAYER", id: payerId }, action: "PAYER_CANCELLED_BEFORE_APPROVAL" });
    }
    if (!REVIEW.includes(p.state)) throw new DecisionError("NOT_REVIEWABLE");
    return move(p, {
      to: "DECLINED",
      actor: { type: "PAYER", id: payerId },
      action: "PAYER_CANCELLED",
      decision: { type: "PAYER_CANCEL", idempotencyKey: `review-decision:${p.id}` },
      patch: { pendingOperation: "VOID", pendingOperationAt: now() },
    });
  });
  return voidPayment(declined);
}

// ---------------------------------------------------------------- contacts

/** Contacts allowed to act now: priority 1 first; everyone after escalation or a self-dealing reroute. */
export async function routedContactIds(p: Payment): Promise<string[]> {
  const contacts = await contactsOf(p.payerId);
  if (p.state === "ESCALATED") return contacts.map((c) => c.id);
  const [reroute] = await db()
    .select({ id: decision.id })
    .from(decision)
    .where(and(eq(decision.paymentId, p.id), eq(decision.accepted, false), eq(decision.rejectionReason, "SELF_DEALING")))
    .limit(1);
  return reroute ? contacts.map((c) => c.id) : contacts.slice(0, 1).map((c) => c.id);
}

export type DecideResult = { payment: Payment; outcome: "APPROVED" | "DECLINED" | "REROUTED" | "ALREADY_DECIDED" };

export async function decide(contactId: string, paymentId: string, verdict: "APPROVE" | "DECLINE"): Promise<DecideResult> {
  // Validate + commit inside the retry loop; PayPal calls only after the commit.
  const step = await retrying(async () => {
    const p = await load(paymentId);
    const [c] = await db().select().from(trustedContact).where(eq(trustedContact.id, contactId));
    if (!c || !c.active || c.payerId !== p.payerId) throw new DecisionError("FORBIDDEN");
    if (!REVIEW.includes(p.state)) throw new DecisionError("NOT_REVIEWABLE");
    if (!p.expiresAt || now() >= p.expiresAt) throw new DecisionError("EXPIRED");
    if (!(await routedContactIds(p)).includes(c.id)) throw new DecisionError("NOT_ROUTED");
    const actor = { type: "CONTACT", id: c.id } as const;

    if (verdict === "DECLINE") {
      const declined = await move(p, {
        to: "DECLINED",
        actor,
        action: "CONTACT_DECLINED",
        decision: { type: "DECLINE", idempotencyKey: `review-decision:${p.id}` },
        patch: { pendingOperation: "VOID", pendingOperationAt: now() },
      });
      return { kind: "DECLINED" as const, payment: declined };
    }

    const [to] = await db().select().from(payee).where(eq(payee.id, p.payeeId));
    if (isSelfDealing(c, to!)) return { kind: "SELF_DEALING" as const, payment: p, contact: c };
    if (!p.payerConfirmedAt) throw new DecisionError("NEEDS_PAYER_CONFIRMATION");

    const approved = await move(p, {
      to: "APPROVED",
      actor,
      action: "CONTACT_APPROVED",
      decision: { type: "APPROVE", idempotencyKey: `review-decision:${p.id}` },
      patch: { pendingOperation: "CAPTURE", pendingOperationAt: now() },
    });
    return { kind: "APPROVED" as const, payment: approved };
  });

  if (step.kind === "APPROVED") return { payment: await capture(step.payment), outcome: "APPROVED" };
  if (step.kind === "DECLINED") return { payment: await voidPayment(step.payment), outcome: "DECLINED" };
  return rejectSelfDealing(step.payment, step.contact);
}

async function rejectSelfDealing(p: Payment, c: { id: string; name: string }): Promise<DecideResult> {
  await db().transaction(async (tx) => {
    const [rejected] = await tx
      .insert(decision)
      .values({
        paymentId: p.id,
        actorType: "CONTACT",
        actorId: c.id,
        type: "APPROVE",
        accepted: false,
        rejectionReason: "SELF_DEALING",
        idempotencyKey: `self-deal:${p.id}:${c.id}`,
      })
      .onConflictDoNothing()
      .returning({ id: decision.id });
    if (rejected) {
      await tx.insert(auditEvent).values({
        paymentId: p.id,
        actorType: "CONTACT",
        actorId: c.id,
        action: "APPROVAL_REJECTED_SELF_DEALING",
        previousState: p.state,
        newState: p.state,
        details: { contact: c.name },
      });
    }
  });

  const [to] = await db().select().from(payee).where(eq(payee.id, p.payeeId));
  const others = (await contactsOf(p.payerId)).filter((o) => o.id !== c.id && !isSelfDealing(o, to!));
  if (others.length > 0) {
    for (const o of others) await notify(p.id, "CONTACT", o.id, "REROUTE");
    return { payment: await load(p.id), outcome: "REROUTED" };
  }
  const declined = await retrying(async () => {
    const cur = await load(p.id);
    if (!REVIEW.includes(cur.state)) return null; // another decision already took effect
    return move(cur, {
      to: "DECLINED",
      actor: SYSTEM,
      action: "DECLINED_NO_ELIGIBLE_CONTACT",
      decision: { type: "DECLINE", idempotencyKey: `review-decision:${p.id}` },
      patch: { pendingOperation: "VOID", pendingOperationAt: now() },
    });
  });
  if (!declined) return { payment: await load(p.id), outcome: "ALREADY_DECIDED" };
  return { payment: await voidPayment(declined), outcome: "DECLINED" };
}

// ---------------------------------------------------------------- time-driven (scheduler, phase 3)

/** Expire an unanswered review and void it. `at` is the scheduler's clock reading. No-op if not due. */
export async function expire(paymentId: string, at: Date = now()): Promise<Payment> {
  const expired = await retrying(async () => {
    const p = await load(paymentId);
    if (!REVIEW.includes(p.state) || !p.expiresAt || at < p.expiresAt) return null;
    return move(p, {
      to: "EXPIRED",
      actor: SYSTEM,
      action: "REVIEW_EXPIRED",
      patch: { pendingOperation: "VOID", pendingOperationAt: now() },
    });
  });
  if (!expired) return load(paymentId);
  await notify(expired.id, "PAYER", expired.payerId, "EXPIRY");
  return voidPayment(expired);
}

/** After the escalation time: open the review to every eligible contact. No-op if not due. */
export async function escalate(paymentId: string, at: Date = now()): Promise<Payment> {
  return retrying(async () => {
    const p = await load(paymentId);
    if (p.state !== "PENDING_REVIEW" || !p.escalationAt || at < p.escalationAt) return p;
    const escalated = await move(p, { to: "ESCALATED", actor: SYSTEM, action: "REVIEW_ESCALATED" });
    for (const c of (await contactsOf(p.payerId)).slice(1)) await notify(p.id, "CONTACT", c.id, "ESCALATION");
    return escalated;
  });
}

/** Buyer never finished PayPal approval within 3 h (scaled): check PayPal once more, then abandon. No money was held. */
export async function abandon(paymentId: string, at: Date = now()): Promise<Payment> {
  const checked = await onBuyerApproved(paymentId); // may have been approved after all
  if (checked.state !== "AWAITING_BUYER" || at < afterPolicy(checked.createdAt, "abandonBuyer")) return checked;
  return retrying(async () => {
    const p = await load(paymentId);
    if (p.state !== "AWAITING_BUYER") return p;
    return move(p, { to: "ABANDONED", actor: SYSTEM, action: "BUYER_APPROVAL_ABANDONED" });
  });
}

/** Finish whatever the payment is waiting on, using stored request IDs. Webhooks and the scan call this. */
export async function reconcile(paymentId: string): Promise<Payment> {
  const p = await load(paymentId);
  switch (p.state) {
    case "AWAITING_BUYER":
      return onBuyerApproved(p.id);
    case "AUTHORIZING":
      return authorize(p);
    case "APPROVED":
      return capture(p);
    case "DECLINED":
    case "EXPIRED":
      return voidPayment(p);
    default:
      return p;
  }
}
