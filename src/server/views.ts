import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import { auditEvent, decision, notification, payee, payer, payment, trustedContact } from "@/server/db/schema";
import { routedContactIds } from "@/server/decision/service";

// Read-only queries for the screens. Every query is scoped by the signed-in actor.

export async function payerHome(payerId: string) {
  const [who] = await db().select().from(payer).where(eq(payer.id, payerId));
  const rows = await db()
    .select({ p: payment, payeeName: payee.displayName })
    .from(payment)
    .innerJoin(payee, eq(payee.id, payment.payeeId))
    .where(eq(payment.payerId, payerId))
    .orderBy(desc(payment.createdAt))
    .limit(20);
  return { payer: who, rows };
}

/** Payees with "new" = no earlier CAPTURED payment (same rule as flagging). */
export async function payeesOf(payerId: string) {
  const all = await db().select().from(payee).where(eq(payee.payerId, payerId)).orderBy(asc(payee.createdAt));
  const known = new Set(
    (await db().select({ id: payment.payeeId }).from(payment).where(and(eq(payment.payerId, payerId), eq(payment.state, "CAPTURED")))).map((r) => r.id),
  );
  return all.map((p) => ({ ...p, isNew: !known.has(p.id) }));
}

export async function contactsOf(payerId: string) {
  return db().select().from(trustedContact).where(eq(trustedContact.payerId, payerId)).orderBy(asc(trustedContact.priority));
}

export async function paymentDetail(paymentId: string) {
  const [row] = await db()
    .select({ p: payment, payee, payer })
    .from(payment)
    .innerJoin(payee, eq(payee.id, payment.payeeId))
    .innerJoin(payer, eq(payer.id, payment.payerId))
    .where(eq(payment.id, paymentId));
  if (!row) return null;
  const contacts = await db().select().from(trustedContact).where(eq(trustedContact.payerId, row.p.payerId)).orderBy(asc(trustedContact.priority));
  const audit = await db().select().from(auditEvent).where(eq(auditEvent.paymentId, paymentId)).orderBy(asc(auditEvent.createdAt));
  const decisions = await db().select().from(decision).where(eq(decision.paymentId, paymentId)).orderBy(asc(decision.createdAt));
  return { ...row, contacts, audit, decisions };
}

export async function contactInbox(contactId: string) {
  const [c] = await db().select().from(trustedContact).where(eq(trustedContact.id, contactId));
  if (!c) return null;
  const open = await db()
    .select({ p: payment, payeeName: payee.displayName })
    .from(payment)
    .innerJoin(payee, eq(payee.id, payment.payeeId))
    .where(and(eq(payment.payerId, c.payerId), inArray(payment.state, ["PENDING_REVIEW", "ESCALATED"])))
    .orderBy(asc(payment.expiresAt));
  const mine = [];
  for (const r of open) {
    if (!(await routedContactIds(r.p)).includes(c.id)) continue;
    // Rerouted here because another contact tried to approve a payment to themselves?
    const [selfDeal] = await db()
      .select({ actorId: decision.actorId })
      .from(decision)
      .where(and(eq(decision.paymentId, r.p.id), eq(decision.accepted, false), eq(decision.rejectionReason, "SELF_DEALING")))
      .limit(1);
    mine.push({ ...r, rerouted: Boolean(selfDeal && selfDeal.actorId !== c.id) });
  }
  const [who] = await db().select().from(payer).where(eq(payer.id, c.payerId));
  return { contact: c, payer: who!, items: mine };
}

export async function outbox(payerId: string) {
  return db()
    .select({ n: notification, p: payment, payeeName: payee.displayName })
    .from(notification)
    .innerJoin(payment, eq(payment.id, notification.paymentId))
    .innerJoin(payee, eq(payee.id, payment.payeeId))
    .where(eq(payment.payerId, payerId))
    .orderBy(desc(notification.createdAt))
    .limit(50);
}
