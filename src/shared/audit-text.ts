import type { auditEvent } from "@/server/db/schema";

type Event = typeof auditEvent.$inferSelect;
export type Who = "payer" | "safety" | "paypal" | "system" | "contact";
export type Line = { id: string; at: Date; who: Who; contactId?: string; text: string; highlight?: boolean };

type Ctx = {
  /** "You" for the payer's own view, the payer's first name for contacts. */
  payerLabel: string;
  payee: string;
  amount: string;
  aiEvidence: string | null;
  contactName: (id: string | null | undefined) => string;
};

/** Plain-language history (comp 6). Request, decision and PayPal confirmation stay separate lines. */
export function historyLines(events: Event[], c: Ctx): Line[] {
  const you = c.payerLabel === "You";
  const lines: Line[] = [];
  const add = (e: Event, who: Who, text: string, extra: Partial<Line> = {}) =>
    lines.push({ id: `${e.id}:${lines.length}`, at: e.createdAt, who, text, ...extra });

  for (const e of events) {
    const d = e.details as Record<string, unknown>;
    const name = c.contactName(e.actorId ?? (d.contact_id as string | undefined)).split(/\s+/)[0]!; // first name, as in comp 6
    switch (e.action) {
      case "SEED_HISTORY": add(e, "system", "Earlier payment (demo seed data, not a live PayPal operation)."); break;
      case "SEND_SUBMITTED":
        add(e, "payer", `${c.payerLabel} started a payment of ${c.amount} to ${c.payee}.`);
        if (d.ai_check === "MATCH") add(e, "safety", `${c.aiEvidence ?? "The message matches a common scam pattern."} We paused the payment.`, { highlight: true });
        if (d.ai_check === "UNAVAILABLE") add(e, "safety", "The safety check couldn't read the message, so we paused the payment to be careful.", { highlight: true });
        break;
      case "BUYER_APPROVED": add(e, "payer", `${c.payerLabel} approved it in PayPal.`); break;
      case "AUTHORIZATION_CONFIRMED_HELD": add(e, "paypal", "PayPal is holding the money. Nothing was sent."); break;
      case "AUTHORIZATION_CONFIRMED_SYSTEM_APPROVED": add(e, "paypal", "PayPal is holding the money. No review was needed."); break;
      case "AUTHORIZATION_DENIED": add(e, "paypal", "PayPal did not authorize the payment. Nothing was sent."); break;
      case "REVIEW_REQUESTED": add(e, "system", `We asked ${name} to check the payment.`); break;
      case "REVIEW_ESCALATED": add(e, "system", "Nobody answered for 12 hours."); break;
      case "REVIEW_ESCALATED_TO": add(e, "system", `We also asked ${name} to check it.`); break;
      case "REVIEW_REROUTED_TO": add(e, "system", `We asked ${name} to check it instead.`); break;
      case "PAYER_CONFIRMED": add(e, "payer", `${c.payerLabel} said ${you ? "you" : "she"} still wanted to send it.`); break;
      case "PAYER_CANCELLED":
      case "PAYER_CANCELLED_BEFORE_APPROVAL": add(e, "payer", `${c.payerLabel} cancelled the payment.`); break;
      case "CONTACT_APPROVED": add(e, "contact", `${name} said yes.${d.message ? ` “${d.message}”` : ""}`, { contactId: e.actorId ?? undefined }); break;
      case "CONTACT_DECLINED": add(e, "contact", `${name} said no.${d.message ? ` “${d.message}”` : ""}`, { contactId: e.actorId ?? undefined }); break;
      case "APPROVAL_REJECTED_SELF_DEALING":
        add(e, "system", `${name}'s approval wasn't accepted: the payment goes to ${name}'s own account.`, { highlight: true }); break;
      case "DECLINED_NO_ELIGIBLE_CONTACT": add(e, "system", "Nobody else could check it, so the payment was stopped."); break;
      case "REVIEW_EXPIRED": add(e, "system", "Nobody decided within 24 hours, so the payment was stopped."); break;
      case "CAPTURE_PENDING": add(e, "paypal", "PayPal is still processing the payment."); break;
      case "CAPTURE_CONFIRMED": add(e, "paypal", `PayPal sent ${c.amount} to ${c.payee}.`); break;
      case "CAPTURE_DENIED": add(e, "paypal", "PayPal declined to send the payment."); break;
      case "VOID_CONFIRMED": add(e, "paypal", `PayPal cancelled the payment. ${you ? "Your" : "The"} ${c.amount} was not sent.`); break;
      case "AUTHORIZATION_RELEASED": add(e, "paypal", "PayPal released the held money."); break;
      case "BUYER_APPROVAL_ABANDONED": add(e, "system", "The PayPal approval was never finished. No money was held."); break;
      case "ORDER_CREATED": break; // internal step, not meaningful to the family
      default: add(e, "system", e.action.toLowerCase().replaceAll("_", " "));
    }
  }
  return lines;
}
