# UI context — Nonna Mode

## Purpose and boundary

Build one large-text web application for a payer, one or two trusted contacts, and an admin. The product is sandbox-only and protects only sends started through Nonna Mode. No mobile application or account-monitoring dashboard is required.

The interface submits commands to the server-side Decision Service. It never calls PayPal capture or void directly and never decides eligibility locally.

## Interface principles

- Put the payment's current status before explanations or secondary actions.
- Use direct, calm language without blame or claims that a recipient is definitely a scammer.
- Distinguish authorization from capture: a payment can be held without being sent.
- Show recipient, full amount, currency, and next step on every decision screen.
- Make cancellation and decline easy to find. Do not make approval the visually dominant default.
- State uncertainty when provider confirmation is pending.
- Explain the self-dealing rule as a system rule, not a family accusation.
- Keep sandbox and protection-boundary disclosures visible.
- When `DEMO_TIME_SCALE` is not 1, show a visible "Demo timing" badge on every screen.

## Information hierarchy and screens

### 1. Payer send screen

Fields: recipient, amount, a note, an optional "Paste a message you received" box, and an explicit unsure option. Use seeded recipient choices for the demo rather than building free-form contact management or an AI payment parser.

Show the configured threshold and currency. The default is €200; the amount rule applies above that value, not at equality.

The note and pasted message are read by the AI scam-pattern check, which can only add a hold. When it does, the explanation names the pattern calmly, for example: “The message you pasted asks for bail money urgently. This is a common pattern in scam calls, so we've paused the payment for a second look.” Never say the sender is definitely a scammer.

### 2. PayPal approval and return

Explain that PayPal approval allows an authorization. For flagged sends, trusted-contact approval is still required before capture.

Do not show “Money held” merely because an order was created or the buyer returned from PayPal. Show a processing state until the server confirms authorization.

### 3. Held-payment detail

Information order:

1. Status: “Payment paused for review.”
2. Recipient and amount.
3. Calm explanation of the actual policy reasons.
4. Required next step and review deadline.
5. Payer confirmation and cancellation actions.
6. Contact-review progress and audit history.

Suggested payer action: **“Yes, I still want to send this.”** Record this as explicit application consent rather than inferring it from a page visit or button in PayPal.

Suggested cancellation action: **“Cancel this payment.”** The server decides whether cancellation can still win the transition race. Do not promise cancellation after capture has begun or completed.

There is no mandatory 24-hour waiting period in the current rules. The display should say when review expires, not promise a fixed cooling-off delay before approval can work.

### 4. Contact inbox and review

Show only requests the contact is currently allowed to review. Include amount, recipient, payer confirmation status, a short factual brief, deadline, and Approve/Decline actions.

Approval covers the whole amount. Do not offer partial approval or amount editing.

If payer confirmation is missing, explain why approval is unavailable. The server must enforce the same condition even if a stale UI enables the button.

For a self-dealing reroute, use factual wording such as: “This payment is to another trusted contact's account, so it needs your review.” Do not assume a sibling relationship unless seeded data establishes it.

### 5. Status and audit log

Present a chronological plain-language record with actor, time, and action. Examples:

- “The safety check noticed the pasted message asks for urgent bail money.”
- “You confirmed you still wanted to send €2,000.”
- “Son's approval was not accepted because the recipient matched his account.”
- “Daughter declined the payment.”
- “PayPal confirmed the authorization was voided.”

Keep request, decision, and provider confirmation as separate events. Do not write “Money stayed with you” until the actual financial outcome supports that claim.

### 6. Admin setup

Keep setup minimal: payer identity, sandbox account references, threshold, timezone, and one or two contacts with priority and account identity. Seed what judges do not need to see. Avoid building general account management.

### 7. Demo start (hosted)

`/demo` explains in two sentences that this is a PayPal sandbox and that Nonna Mode protects only sends made through it. One **Start a demo** button creates an isolated scenario. The page then shows the signed sign-in links for the payer and both contacts (to open in separate browser profiles), the PayPal sandbox buyer login, and a link to the scenario's outbox. Label everything demo-only.

## Key states

| State | User-facing treatment |
|---|---|
| AWAITING_BUYER | “Finish approval in PayPal.” No claim that funds are held. |
| ABANDONED | “This payment was not started. No money was held.” |
| AUTHORIZING | “Checking the payment with PayPal.” |
| APPROVED (unflagged) | “Sending…” then CAPTURED. No review screens appear. |
| PENDING_REVIEW | “Payment paused for review.” Show missing consent. |
| ESCALATED | “Another trusted contact has been asked to review.” |
| APPROVED | “Approved. Confirming the payment with PayPal.” Not yet “Sent.” |
| CAPTURED | “Payment sent,” with confirmed amount and recipient. |
| DECLINED / EXPIRED | “Payment will not be sent. Confirming cancellation with PayPal.” |
| VOIDED | “Authorization voided. This payment was not captured.” |
| FAILED / uncertain provider result | State what is known and that status is being checked; do not encourage an immediate duplicate send. |

Also handle empty inbox, stale decision, unauthorized access, AI timeout, email failure, and connection loss. Stale decisions should reload current status and explain that another decision already took effect.

## Visual direction

- Use a restrained palette, clear typography, and a single-column primary task layout.
- Starting assumption: 20px body text, comfortable line spacing, and controls at least 44px high.
- Use text and icons alongside status colors; never rely on color alone.
- Avoid countdown pressure, alarming animation, dense charts, and financial jargon.
- Keep primary content readable at 200% zoom and support keyboard navigation, visible focus, and screen-reader labels.
- Treat WCAG AA contrast as the implementation target, not a completed certification.

## Responsive behavior

Use the same web application on desktop and small screens. Stack decision controls on narrow layouts, avoid horizontal scrolling, and convert audit tables into readable event cards where needed.

For recording, payer and contact screens may be shown side by side in separate browser profiles, each signed in through its own signed link. Do not build a role switcher.

## Email

Emails (Resend) carry short notices and signed, expiring links back to the review interface. They do not approve, decline, capture, or void payments directly. Cover immediate review, 12-hour escalation, self-dealing rerouting, decision results, and expiry. Do not put credentials or unnecessary sensitive note content in email. The demo outbox shows the same notices in-app for judges.

## Open questions

- Exact typography, palette, and component library remain undecided.

Decided: access uses signed, expiring email links; the recorded story uses EUR throughout.
