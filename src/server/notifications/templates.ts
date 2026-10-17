import type { notification } from "@/server/db/schema";
import { formatEur } from "@/shared/format";

type N = typeof notification.$inferSelect;
// The contact brief (which summarises the pasted message) stays in the app, never in email.
type Ctx = { amountMinor: number; payeeName: string; recipientName: string; payerName: string; explanation?: string | null };

/** Notice text for email (phase 3) and the in-app demo outbox. No note content, no credentials. Never sent "from PayPal". */
export function renderNotice(n: N, c: Ctx): { subject: string; body: string } {
  const amount = formatEur(c.amountMinor);
  switch (n.type) {
    case "PAUSE_NOTICE": return { subject: "Your payment is paused for a second look", body: c.explanation ?? `Your payment of ${amount} to ${c.payeeName} is paused. No money has been sent. Open Nonna Mode to see why and what happens next.` };
    case "REVIEW_REQUEST": return { subject: `${c.payerName} needs your review`, body: `${c.payerName} wants to send ${amount} to ${c.payeeName}. Please review it in Nonna Mode within 24 hours.` };
    case "ESCALATION": return { subject: `${c.payerName}'s payment is waiting for review`, body: `The first trusted contact hasn't answered. ${c.payerName}'s payment of ${amount} to ${c.payeeName} needs a review.` };
    case "REROUTE": return { subject: `${c.payerName}'s payment needs your review`, body: `This payment of ${amount} is to another trusted contact's account, so it needs your review.` };
    case "OUTCOME": return { subject: "Update on your payment", body: `There's an update on your payment of ${amount} to ${c.payeeName}. Open Nonna Mode to see what PayPal confirmed.` };
    case "EXPIRY": return { subject: "Your paused payment was stopped", body: `Nobody reviewed your payment of ${amount} to ${c.payeeName} within 24 hours, so it was stopped. No money will be sent.` };
  }
}
