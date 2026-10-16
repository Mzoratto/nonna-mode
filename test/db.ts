import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { payee, payer, payment, type PaymentState } from "@/server/db/schema";

export const hasTestDb = Boolean(process.env.DATABASE_URL_TEST);

/** Test-branch reset. TRUNCATE is allowed; row-level UPDATE/DELETE on audit_event is not. */
export async function resetDb() {
  await db().execute(
    sql`truncate webhook_event, notification, audit_event, decision, payment, payee, trusted_contact, payer restart identity cascade`,
  );
}

export async function makePayment(over: { state?: PaymentState; paypalOrderId?: string } = {}) {
  const [p] = await db().insert(payer).values({ name: "Nonna Test", email: "nonna@example.com" }).returning();
  const [q] = await db().insert(payee).values({ payerId: p!.id, displayName: "Recipient" }).returning();
  const [row] = await db()
    .insert(payment)
    .values({
      payerId: p!.id,
      payeeId: q!.id,
      amountMinor: 25000,
      flagged: true,
      flaggedReasons: ["OVER_THRESHOLD"],
      state: over.state ?? "PENDING_REVIEW",
      paypalOrderId: over.paypalOrderId,
    })
    .returning();
  return row!;
}
