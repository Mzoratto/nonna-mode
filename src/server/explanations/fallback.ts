import type { FlagReason } from "@/server/db/schema";
import { minorToValue } from "@/server/money";

// Deterministic wording, used when the OpenAI wording call is unavailable (and
// until it lands in phase 3). Calm, factual, never "this is a scam".
const PAYER_LINES: Record<FlagReason, (f: Facts) => string> = {
  NEW_PAYEE: (f) => `You haven't sent money to ${f.payee} through Nonna Mode before.`,
  OVER_THRESHOLD: (f) => `€${minorToValue(f.amountMinor)} is more than your €${minorToValue(f.thresholdMinor)} limit for sending without a second look.`,
  PAYER_UNSURE: () => "You told us you weren't sure about this payment.",
  AI_SCAM_PATTERN: (f) => `${f.aiEvidence ?? "The message looks like a pattern often used in scams."} This is common in scam calls, so we've paused it for a second look.`,
  AI_CHECK_UNAVAILABLE: () => "We couldn't finish our automatic safety check on your note, so we paused it to be careful.",
};

const BRIEF_REASONS: Record<FlagReason, string> = {
  NEW_PAYEE: "new recipient",
  OVER_THRESHOLD: "above the limit",
  PAYER_UNSURE: "payer marked unsure",
  AI_SCAM_PATTERN: "note matches a common scam pattern",
  AI_CHECK_UNAVAILABLE: "automatic note check unavailable",
};

export type Facts = {
  payerName: string;
  payee: string;
  amountMinor: number;
  thresholdMinor: number;
  reasons: FlagReason[];
  aiEvidence: string | null;
};

export function fallbackWording(f: Facts): { explanation: string; brief: string } {
  const why = f.reasons.map((r) => PAYER_LINES[r](f)).join(" ");
  return {
    explanation: `Your payment of €${minorToValue(f.amountMinor)} to ${f.payee} is paused, and no money has been sent. ${why} If you still want to send it, confirm below, and one of your trusted contacts will take a look.`,
    brief: `${f.payerName} wants to send €${minorToValue(f.amountMinor)} to ${f.payee}. Paused because: ${f.reasons.map((r) => BRIEF_REASONS[r]).join(", ")}.`,
  };
}
