import type { PaymentState } from "@/server/db/schema";

// ui-context.md "Key states". Never claim money moved before PayPal confirmed it.
export type Tone = "neutral" | "waiting" | "paused" | "ok" | "stopped";

export function statusView(state: PaymentState, flagged: boolean): { title: string; tone: Tone; icon: string } {
  switch (state) {
    case "AWAITING_BUYER": return { title: "Finish approval in PayPal.", tone: "neutral", icon: "↗" };
    case "ABANDONED": return { title: "This payment was not started. No money was held.", tone: "stopped", icon: "○" };
    case "AUTHORIZING": return { title: "Checking the payment with PayPal…", tone: "waiting", icon: "⋯" };
    case "PENDING_REVIEW": return { title: "Payment paused for review.", tone: "paused", icon: "⏸" };
    case "ESCALATED": return { title: "Payment paused. Another trusted contact has been asked to review.", tone: "paused", icon: "⏸" };
    case "APPROVED": return { title: flagged ? "Approved. Confirming the payment with PayPal…" : "Sending…", tone: "waiting", icon: "⋯" };
    case "CAPTURED": return { title: "Payment sent.", tone: "ok", icon: "✓" };
    case "DECLINED":
    case "EXPIRED": return { title: "This payment will not be sent. Confirming cancellation with PayPal…", tone: "waiting", icon: "⋯" };
    case "VOIDED": return { title: "Payment cancelled. PayPal confirmed no money was taken.", tone: "stopped", icon: "✕" };
    case "FAILED": return { title: "PayPal did not complete this payment. Please don't send it again yet; we're checking.", tone: "stopped", icon: "!" };
  }
}

/** States that change on their own shortly: the page refreshes itself while in them. */
export const TRANSITIONAL: PaymentState[] = ["AUTHORIZING", "APPROVED", "DECLINED", "EXPIRED"];
