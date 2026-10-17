import "server-only";
import { eq } from "drizzle-orm";
import { signToken } from "@/server/auth/links";
import { db } from "@/server/db/client";
import { notification, payee, payer, payment, trustedContact } from "@/server/db/schema";
import { now } from "@/server/time";
import { renderNotice } from "./templates";

// Email via Resend. Delivery never throws and never rolls back a payment decision.
// The notice's idempotency key is sent as Resend's Idempotency-Key, so retries can't duplicate an email.
const RESERVED = /@(?:[\w-]+\.)*(?:example\.(?:com|org|net)|test|invalid|localhost)$/i; // RFC 2606 demo addresses
const TIMEOUT_MS = 5_000;

type Outcome = "SENT" | "SKIPPED" | "FAILED" | "PENDING";

export async function deliver(notificationId: string, deps: { fetch?: typeof fetch } = {}): Promise<Outcome> {
  try {
    const [row] = await db()
      .select({ n: notification, p: payment, payeeName: payee.displayName, payer })
      .from(notification)
      .innerJoin(payment, eq(payment.id, notification.paymentId))
      .innerJoin(payee, eq(payee.id, payment.payeeId))
      .innerJoin(payer, eq(payer.id, payment.payerId))
      .where(eq(notification.id, notificationId));
    if (!row || row.n.status === "SENT" || row.n.status === "SKIPPED") return row?.n.status ?? "FAILED";
    const { n, p } = row;

    const contact = n.recipientType === "CONTACT"
      ? (await db().select().from(trustedContact).where(eq(trustedContact.id, n.recipientId)))[0]
      : undefined;
    const recipientName = contact?.name ?? row.payer.name;
    const address = process.env.DEMO_EMAIL_OVERRIDE || (contact ? contact.emailNormalized : row.payer.email);
    const key = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    const mark = async (status: Outcome) => {
      await db().update(notification).set({ status, sentAt: status === "SENT" ? now() : null }).where(eq(notification.id, n.id));
      return status;
    };
    if (!key || !from || RESERVED.test(address)) return mark("SKIPPED"); // shown in the in-app outbox instead

    const msg = renderNotice(n, { amountMinor: p.amountMinor, payeeName: row.payeeName, recipientName, payerName: row.payer.name, explanation: p.explanationText });
    const link = `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/auth/${signToken(
      { t: n.recipientType === "CONTACT" ? "CONTACT" : "PAYER", id: n.recipientId, pid: p.id }, 24 * 3600)}`;
    const res = await (deps.fetch ?? fetch)("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": n.idempotencyKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        from,
        to: [address],
        subject: msg.subject,
        text: `Hello ${recipientName.split(/\s+/)[0]},\n\n${msg.body}\n\nOpen Nonna Mode: ${link}\n(This link signs you in and expires in 24 hours.)\n\n--\nNonna Mode is a PayPal sandbox demo. This email is from Nonna Mode, not from PayPal.`,
      }),
    });
    if (res.ok) return mark("SENT");
    // 4xx: a definite refusal (bad address, unverified sender): don't retry. 5xx: the scan retries.
    console.error("[email] resend refused", n.id, res.status, (await res.text()).slice(0, 200));
    return mark(res.status >= 400 && res.status < 500 ? "FAILED" : "PENDING");
  } catch (err) {
    console.error("[email] delivery error, will retry", notificationId, err);
    return "PENDING";
  }
}
