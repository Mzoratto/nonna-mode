import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { type ActorType, auditEvent, decision, type DecisionType, payment, type PaymentState } from "@/server/db/schema";
import { now } from "@/server/time";

export type Db = NodePgDatabase;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Payment = typeof payment.$inferSelect;

/** The state machine (architecture-context.md). Capture only from APPROVED; void only from DECLINED/EXPIRED. */
export const ALLOWED: Record<PaymentState, readonly PaymentState[]> = {
  AWAITING_BUYER: ["AUTHORIZING", "ABANDONED"],
  AUTHORIZING: ["PENDING_REVIEW", "APPROVED", "FAILED"],
  PENDING_REVIEW: ["ESCALATED", "APPROVED", "DECLINED", "EXPIRED"],
  ESCALATED: ["APPROVED", "DECLINED", "EXPIRED"],
  APPROVED: ["CAPTURED", "FAILED"],
  DECLINED: ["VOIDED"],
  EXPIRED: ["VOIDED"],
  CAPTURED: [],
  VOIDED: [],
  ABANDONED: [],
  FAILED: [],
};

/** Someone else changed the payment first. Reload; never call PayPal on the stale view. */
export class Conflict extends Error {
  constructor(readonly paymentId: string) {
    super(`payment ${paymentId} changed concurrently`);
  }
}

export type TransitionInput = {
  paymentId: string;
  /** The state and version the caller loaded. Both must still hold. */
  from: PaymentState;
  version: number;
  to: PaymentState;
  actor: { type: ActorType; id?: string | null };
  action: string;
  details?: Record<string, unknown>;
  /** An accepted Decision recorded atomically with the transition. */
  decision?: { type: DecisionType; idempotencyKey: string };
  patch?: Omit<Partial<typeof payment.$inferInsert>, "id" | "state" | "version">;
};

/** One compare-and-set state change + its Decision + its AuditEvent, in one transaction. */
export async function transition(ex: Db | Tx, t: TransitionInput): Promise<Payment> {
  if (!ALLOWED[t.from].includes(t.to)) throw new Error(`illegal transition ${t.from} → ${t.to}`);
  return ex.transaction(async (tx) => {
    const [row] = await tx
      .update(payment)
      .set({ ...t.patch, state: t.to, version: t.version + 1, updatedAt: now() })
      .where(and(eq(payment.id, t.paymentId), eq(payment.state, t.from), eq(payment.version, t.version)))
      .returning();
    if (!row) throw new Conflict(t.paymentId);

    const actorId = t.actor.id ?? null;
    if (t.decision) {
      await tx.insert(decision).values({
        paymentId: t.paymentId,
        actorType: t.actor.type,
        actorId,
        type: t.decision.type,
        accepted: true,
        idempotencyKey: t.decision.idempotencyKey,
      });
    }
    await tx.insert(auditEvent).values({
      paymentId: t.paymentId,
      actorType: t.actor.type,
      actorId,
      action: t.action,
      previousState: t.from,
      newState: t.to,
      details: t.details ?? {},
    });
    return row;
  });
}
