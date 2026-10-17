// Plain-language text for Decision Service refusals (shown after a redirect with ?error=CODE).
export const ERROR_TEXT: Record<string, string> = {
  NOT_FOUND: "We couldn't find that payment.",
  FORBIDDEN: "You don't have access to this payment.",
  NOT_REVIEWABLE: "A decision has already been made on this payment. The current status is shown below.",
  EXPIRED: "The review time for this payment has ended, so it can no longer be approved.",
  NOT_ROUTED: "This payment isn't waiting for your review yet.",
  NEEDS_PAYER_CONFIRMATION: "The sender hasn't confirmed this payment yet, so it can't be approved. You can still decline it.",
  STALE: "Something changed while you were deciding. Here is the latest status.",
  PAYPAL_UNAVAILABLE: "PayPal didn't answer in time. Your choice is saved and we'll finish it automatically. Please don't repeat it.",
  RATE_LIMITED: "Too many demos started from here recently. Please try again in an hour.",
};
