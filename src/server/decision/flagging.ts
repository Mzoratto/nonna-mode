import type { AiPattern, FlagReason } from "@/server/db/schema";

/** Stored result of the one-way AI scam-pattern check. */
export type AiCheck =
  | { status: "NOT_RUN" }
  | { status: "NO_MATCH" }
  | { status: "MATCH"; pattern: AiPattern; evidence: string }
  | { status: "UNAVAILABLE" };

export type FlagInput = {
  isNewPayee: boolean;
  amountMinor: number;
  thresholdMinor: number;
  payerUnsure: boolean;
  /** A note or pasted message was provided, so the AI check was required. */
  textPresent: boolean;
  ai: AiCheck;
};

/**
 * Deterministic rules ∪ AI reasons. The AI part can only ADD a reason: there
 * is no code path where its result removes one. Text present but no AI result
 * fails closed (AI_CHECK_UNAVAILABLE).
 */
export function computeReasons(input: FlagInput): FlagReason[] {
  const reasons = new Set<FlagReason>();
  if (input.isNewPayee) reasons.add("NEW_PAYEE");
  if (input.amountMinor > input.thresholdMinor) reasons.add("OVER_THRESHOLD"); // strictly greater
  if (input.payerUnsure) reasons.add("PAYER_UNSURE");

  if (input.ai.status === "MATCH") reasons.add("AI_SCAM_PATTERN");
  if (input.ai.status === "UNAVAILABLE" || (input.textPresent && input.ai.status === "NOT_RUN")) {
    reasons.add("AI_CHECK_UNAVAILABLE");
  }
  return [...reasons];
}
