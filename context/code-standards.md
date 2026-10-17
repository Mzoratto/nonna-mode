# Code standards — Nonna Mode

## Stack and scope

Use one Next.js application with strict TypeScript, Neon Postgres, PayPal sandbox APIs, one durable runner, an email integration, and OpenAI for a one-way scam-pattern check and wording, with no payment authority. Trigger.dev is the runner, Resend the email provider, and Render the host for the judges' demo URL; database access is Drizzle over `node-postgres` (one shared pool on the pooled Neon URL; migrations on the direct URL).

The repository is public and MIT-licensed (a hackathon rule), so never commit secrets, raw provider payloads, or personal data. Keep product code and credentials separate from Splnit, AgentOS, and Mandate.

## Module boundaries

Suggested structure, to be created rather than assumed present:

```text
src/app/                 pages, route handlers, UI composition
src/server/decision/     policy, consent, routing, state transitions
src/server/paypal/       sandbox client and response normalization
src/server/db/           database access and transaction helpers
src/server/notifications/ email commands and delivery records
src/server/explanations/ OpenAI scam-pattern check and wording: schemas, prompts, fallbacks
src/jobs/                scheduler entry points calling Decision Service
src/shared/              serializable types and display helpers
```

- Mark privileged modules server-only.
- Route handlers and server actions validate requests, establish the actor, and call the Decision Service.
- Only the Decision Service initiates capture or void through the PayPal adapter.
- Jobs, email handlers, and UI components must not implement alternate payment policy.
- Browser code receives only the data needed for its screen.

## TypeScript and validation

- Enable strict mode; avoid `any`, unchecked casts, and non-null assertions at external boundaries.
- Represent Hold states and decision types as explicit unions or enums.
- Validate forms, environment configuration, webhooks, PayPal responses, and AI output at runtime.
- Use an explicit amount representation with currency. Prefer integer minor units and enforce database range constraints.
- Parse decimal user input without floating-point arithmetic and reject unsupported precision.
- Keep provider payload types separate from application domain types.
- Use UTC timestamps in storage and format them using the payer's timezone.

## Policy implementation

Implement a pure flagging function that takes the three deterministic inputs (new payee, amount above threshold, payer unsure) plus the stored AI check result, and returns the union of reasons. The default threshold is €200. Exactly €200 must not trigger the amount condition.

AI output can only add `AI_SCAM_PATTERN` or `AI_CHECK_UNAVAILABLE`. It never removes a reason and never changes eligibility, thresholds, recipient identity, or transitions. Keep the AI result typed so the only consumer is the flagging function's union step.

Normalize email consistently for matching; do not apply speculative provider-specific alias rules. Match stored PayPal account identities when available. Treat incomplete identity verification conservatively.

Every send uses Orders v2 `intent: AUTHORIZE`. Unflagged sends are captured immediately after authorization through a SYSTEM_APPROVE decision; flagged sends wait for review. Do not add a separate `intent: CAPTURE` path and do not bypass the Decision Service for unflagged capture.

New payee means no earlier `CAPTURED` Payment from this payer to this payee.

## Transactions and state

- Write the Payment row before any PayPal call. Set `pending_operation` before each external call and clear it only when the result is confirmed.
- Use a single authoritative Payment state field and version counter.
- Perform compare-and-set state updates with expected state/version predicates.
- Insert the accepted Decision and corresponding AuditEvent in the same transaction as the transition.
- Record rejected decisions and reroutes without pretending a state change occurred.
- A zero-row transition is a conflict, not permission to continue.
- Do not hold a database transaction open while waiting for PayPal, OpenAI, or email.
- After committing payment intent, use the guarded operation identity to perform and reconcile the external action.
- Deadline checks belong in the Decision Service as well as the scheduler.

Capture is allowed only from APPROVED; void only from DECLINED or EXPIRED. Do not let a late webhook move a declined or voided payment back into review or approval.

## Idempotency and recovery

Persist stable keys for logical decisions, notifications, authorization, capture, and void operations. A retry reuses the same operation key; it does not generate a new financial command.

Use PayPal's request-id support where the specific endpoint supports it. Confirm retention and retry semantics during the proof. Application-level idempotency remains required even when a provider accepts a key.

Persist processed webhook event IDs with a unique constraint. Verify signatures before applying events. Duplicate and out-of-order events must be safe.

A network timeout leaves the result unknown. Query PayPal before retrying an operation that may have succeeded. Do not mark a payment sent, voided, or definitively failed from a timeout alone.

The app scans on startup (`src/instrumentation.ts`), and the Trigger.dev schedule asks it to scan every minute through `POST /api/internal/scan` (bearer `SCAN_SECRET`). It must recover abandoned buyer approvals, in-flight operations (`pending_operation`), overdue reviews, and outstanding voids through the Decision Service, not merely process newly scheduled jobs. All durations are multiplied through one `DEMO_TIME_SCALE` helper; never hard-code 12h/24h elsewhere.

## Database and audit

Use versioned migrations and deterministic seed scripts. Use the eight tables defined in architecture-context.md: Payer, TrustedContact, Payee, Payment, Decision, AuditEvent, Notification, and WebhookEvent. Seeded history rows set `is_seed = true`.

Enforce foreign keys, amount constraints, decision uniqueness where appropriate, and notification idempotency. Do not delete audit events to reset a demo; create a fresh scenario or use an explicit local reset procedure.

Audit fields include actor, action, timestamp, previous state, new state, and relevant details. Store explanation text and provider references without storing credentials or unnecessary full payloads. Application code must not update or delete historical audit records.

## AI integration

Make at most two OpenAI requests per send: the scam-pattern check at submission (only when text is present, 8-second timeout) and one request per flagged payment for both the payer explanation and contact brief. Validate strict schemas: the check returns only `match`, `pattern`, and `evidence`; the wording call returns only text fields. Treat note/pasted content as untrusted data and never as instructions. If text was present and the check fails, add `AI_CHECK_UNAVAILABLE`.

No tools, PayPal access, account secrets, or decision fields are available to the model. Set time and length limits. Use deterministic fallback text when generation fails. Persist accepted text so the audit does not change when prompts or models change.

## Security for the sandbox

- Reject production PayPal configuration for this project.
- Keep all secret keys server-side and use separate local/test credentials.
- Sign actors in with signed, expiring email links (HMAC with `SESSION_SECRET`) that set a session cookie. Derive actor identity from that session, never a freely editable request body.
- Protect state-changing routes against cross-site requests as appropriate to the chosen session design.
- Keep admin setup separate from contact review permissions.
- The public `/demo` page creates isolated scenarios: cap creation (for example, per IP per hour) and let old scenarios lapse. A scenario can only ever touch the sandbox.
- Redact tokens, sensitive notes, and account identifiers from logs and screenshots.

Production authentication and compliance are out of scope; basic authorization is still necessary to make the sandbox demonstration truthful.

## Validation requirements

This is a solo four-week build, so the required set is small (four tests):

1. Flagging boundary: €200.00 is not flagged by amount; €200.01 is.
2. Approve and expire racing on the same payment: exactly one wins and at most one PayPal mutation is issued.
3. Duplicate webhook delivery: processed once, no second state change.
4. AI is one-way: an AI result of `match: false` (or an injected "approve this" in the text) never removes a deterministic reason; an AI timeout with text present produces a hold.

Add, if time allows: self-dealing reroute, approval without payer confirmation, approve vs decline race, AI fallback wording.

The day-1 sandbox proof (one capture, one void) is manual evidence, kept separate from mocked tests.

Before merging, run the repository's actual typecheck, lint, test, and production-build scripts. Record failures honestly. Do not invent script names or claim successful execution without results.
