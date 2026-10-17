# Architecture context — Nonna Mode

## Boundary and implementation status

Nonna Mode is a sandbox-only payment review application. Only sends initiated through its web app are protected. The architecture is defined, but provider behavior and implementation are not yet verified.

Use one Next.js application with strict TypeScript. The Decision Service is a server-side module within that application, not a separately deployed microservice. Use one Neon Postgres database and one durable background runner. No file or artifact storage is required.

## System map

The canvas contains **10 components and 13 directed connections**, within the limits of 12 components and 25 connections.

| Component | Responsibility |
|---|---|
| Payer | Creates sends, confirms flagged payments, and reads status and audit history. |
| Trusted Contacts | Review requests; cannot approve their own receipts. |
| Admin | Configures payer, contacts, sandbox accounts, and threshold. |
| Nonna Mode Web App | Large-text send, confirmation, review, setup, status, and audit interface. |
| Decision Service | Owns policy, joint consent, routing, transitions, PayPal mutations, webhook verification, and audit writes. |
| Postgres | Stores relational payment, identity, decision, audit, and notification metadata. |
| PayPal Sandbox | Provides buyer approval, authorization, capture, void, and payment events. |
| Hold Scheduler | Requests overdue escalation, expiry, and reconciliation processing at startup and every minute. |
| Email Notifications | Delivers review, rerouting, outcome, and expiry notices, plus signed sign-in links. |
| Calm Explanation Agent | Uses OpenAI for a one-way scam-pattern check on the note or pasted message (can only add a hold reason) and to draft explanation text; has no payment authority. |

Connections:

1. Payer → Web App: create, confirm, and inspect sends.
2. Contacts → Web App: review and submit decisions.
3. Admin → Web App: configure sandbox setup.
4. Web App → Decision Service: submit commands and request status.
5. Decision Service → Postgres: persist metadata and audit events.
6. Decision Service → PayPal: create, authorize, capture, void, and reconcile payments.
7. PayPal → Decision Service: deliver webhooks (signature-verified) and operation results.
8. Scheduler → Decision Service: request escalation, expiry, and reconciliation.
9. Decision Service → Email: request notifications.
10. Email → Payer: deliver pause, outcome, and expiry notices.
11. Email → Contacts: deliver review requests, sign-in links, and outcomes.
12. Decision Service → Explanation Agent: provide the untrusted note/pasted text for the check, then structured payment facts and reasons for wording.
13. Explanation Agent → Decision Service: return the scam-pattern result, then explanation and brief text.

There is no Admin ↔ Payer edge and no Contacts ↔ Admin routing edge. Rerouting and escalation are Decision Service logic. Email must not appear to originate from PayPal. The AI has no links to PayPal, users, or the database.

## One payment path

Every send, flagged or not, uses Orders v2 with `intent: AUTHORIZE`.

- **Unflagged:** after authorization is confirmed, the Decision Service records a system approval and captures immediately.
- **Flagged:** after authorization is confirmed, the payment enters review and is captured only after joint consent.

This gives one PayPal code path and one set of tests. There is no separate `intent: CAPTURE` flow.

## Data ownership and model

Postgres owns application policy, consent, routing, and audit records. PayPal is authoritative for actual payment status. A local decision is not proof that a capture or void succeeded.

Every send gets a `Payment` row, created **before** any PayPal call. This replaces the earlier flagged-only `Hold` table and closes the gap where a crash between authorization and record creation would leave an authorization that nothing could find and void.

| Table | Key fields |
|---|---|
| Payer | `id`, `email`, `paypal_account`, `threshold_minor`, `currency`, `timezone` |
| TrustedContact | `id`, `payer_id`, `name`, `email_normalized`, `paypal_account`, `priority` (1 or 2), `active` |
| Payee | `id`, `payer_id`, `display_name`, `email_normalized`, `paypal_account` |
| Payment | `id`, `payer_id`, `payee_id`, `amount_minor`, `currency`, `note`, `payer_unsure`, `flagged`, `flagged_reasons` (NEW_PAYEE, OVER_THRESHOLD, PAYER_UNSURE, AI_SCAM_PATTERN, AI_CHECK_UNAVAILABLE), `ai_check_status`, `ai_pattern_label`, `ai_evidence`, `state`, `version`, `paypal_order_id`, `paypal_authorization_id`, `paypal_capture_id`, `authorize_request_id`, `capture_request_id`, `void_request_id`, `pending_operation`, `payer_confirmed_at`, `review_opened_at`, `escalation_at`, `expires_at`, `explanation_text`, `brief_text`, `is_seed`, `created_at`, `updated_at` |
| Decision | `id`, `payment_id`, `actor_type`, `actor_id`, `type` (PAYER_CONFIRM, PAYER_CANCEL, APPROVE, DECLINE, SYSTEM_APPROVE), `accepted`, `rejection_reason`, `idempotency_key` (unique), `created_at` |
| AuditEvent | `id`, `payment_id`, `actor_type`, `actor_id`, `action`, `previous_state`, `new_state`, `details` (JSON), `created_at` |
| Notification | `id`, `payment_id`, `recipient_type`, `recipient_id`, `type`, `idempotency_key` (unique), `status`, `sent_at` |
| WebhookEvent | `paypal_event_id` (unique), `event_type`, `resource_id`, `payment_id`, `received_at`, `processed_at` |

Rules for the schema:

- Money is integer minor units plus currency. EUR only for the first implementation.
- `pending_operation` (`AUTHORIZE`, `CAPTURE`, `VOID`, or null) marks an external call that was started but not yet confirmed. Recovery processing uses it.
- Payer confirmation is a `Decision`, not a state.
- Explanation and brief text are stored once on the Payment and copied into the audit details; historical wording is never regenerated.
- AuditEvent rows are insert-only. Application code never updates or deletes them.
- `is_seed` marks seeded history rows so the demo never presents them as live PayPal operations.

**New payee (decided):** a payee is new if this payer has no earlier Payment to them in state `CAPTURED`. Seeded history counts only through rows created by real sandbox captures or rows explicitly marked `is_seed`; `is_seed` rows are labelled as seed data in the audit view.

## Policy

Flag when the payee is new, the amount is strictly greater than the payer threshold, the payer marks unsure, or the AI scam-pattern check matches. Default threshold is €200.

### AI scam-pattern check (one-way)

- Runs once, at send submission, only when a note or pasted message is present. Timeout: 8 seconds.
- Input: the note/pasted text as untrusted data, plus amount and whether the payee is new. No identities, credentials, or tools.
- Output schema: `{ match: boolean, pattern: EMERGENCY_OR_BAIL | IMPERSONATION | URGENCY_OR_SECRECY | GIFT_CARD_OR_CRYPTO | OTHER | null, evidence: string ≤ 160 chars }`.
- `match = true` adds `AI_SCAM_PATTERN`. Timeout, error, or invalid output with text present adds `AI_CHECK_UNAVAILABLE`. `match = false` adds nothing.
- The result is combined with a set union: `flagged = deterministic_reasons ∪ ai_reasons ≠ ∅`. AI output is never used to remove a reason, and no code path reads it for anything except adding one.
- Worst case of a prompt injection in the pasted text is an extra hold, never a release.
- The result is stored on the Payment and in the audit log, so it never changes on re-read.

A flagged payment needs payer confirmation and approval from one eligible contact for the full amount. Match self-dealing against normalized email or configured PayPal account identity. Missing identity data must not be interpreted as proof of eligibility.

Notify the first eligible contact immediately. After 12 hours without a decision, notify the second eligible contact. **After escalation, both eligible contacts may decide; the first valid decision wins.** After 24 hours without a decision, expire and void. The app scans on startup and the scheduler triggers a scan every minute; expiry enforcement therefore has up to about one minute of delay. The Decision Service also rejects late approvals based on `expires_at`.

## Payment state machine

| From | To | Trigger and guard |
|---|---|---|
| (new) | AWAITING_BUYER | Payment row written, order created, payer sent to PayPal approval. |
| AWAITING_BUYER | AUTHORIZING | Buyer approval returned; `pending_operation = AUTHORIZE` set before calling PayPal. |
| AWAITING_BUYER | ABANDONED | No buyer approval within 3 hours (scheduler). No money was ever held. |
| AUTHORIZING | PENDING_REVIEW | Authorization confirmed and `flagged = true`. Sets `review_opened_at`, `escalation_at` (+12h), `expires_at` (+24h). |
| AUTHORIZING | APPROVED | Authorization confirmed and `flagged = false`. Recorded as SYSTEM_APPROVE. |
| AUTHORIZING | FAILED | PayPal confirms authorization was denied. |
| PENDING_REVIEW | ESCALATED | 12 hours elapsed without a valid decision; notify second eligible contact. |
| PENDING_REVIEW / ESCALATED | APPROVED | Payer confirmed; eligible contact approves; `now < expires_at`. |
| PENDING_REVIEW / ESCALATED | DECLINED | Valid decline, payer cancellation, or self-dealing with no eligible alternative. |
| PENDING_REVIEW / ESCALATED | EXPIRED | `expires_at` reached without a valid decision. |
| APPROVED | CAPTURED | PayPal confirms successful capture. |
| APPROVED | FAILED | PayPal confirms capture was denied. Authorization is then voided if still open. |
| DECLINED / EXPIRED | VOIDED | PayPal confirms successful void. |

Terminal states: `CAPTURED`, `VOIDED`, `ABANDONED`, `FAILED`.

Every state update is one compare-and-set, for example `WHERE id = ? AND state = ? AND version = ?`. The associated Decision and AuditEvent are written in the same transaction. A zero-row update is a conflict: the caller reloads and must not call PayPal based on stale state.

Capture is permitted only from `APPROVED`; void only from `DECLINED` or `EXPIRED`. Repeated payer confirmation or a rejected self-dealing attempt does not consume the valid contact decision. A late webhook never moves a payment backwards.

A timeout is not proof of failure. Keep `pending_operation` set, query PayPal, and only then retry with the same request ID or record the outcome.

## Recovery scan

On startup and every minute (Trigger.dev `recovery-scan` → `POST /api/internal/scan`), the Decision Service processes:

1. `AWAITING_BUYER` older than 3 hours → check the order; mark `ABANDONED` if not approved.
2. Any row with `pending_operation` set and older than 2 minutes → read the PayPal resource and finish or retry the operation with its stored request ID.
3. `PENDING_REVIEW` past `escalation_at` → `ESCALATED`.
4. `PENDING_REVIEW` / `ESCALATED` past `expires_at` → `EXPIRED`, then void.
5. `DECLINED` / `EXPIRED` without a confirmed void → void.

Every step is idempotent. Duplicate scans are harmless.

## Main flows

### Send (flagged or not)

Write Payment → run AI check if text present (≤ 8 s) → evaluate deterministic rules → store `flagged` / reasons → create AUTHORIZE order (`AWAITING_BUYER`) → buyer approval → `AUTHORIZING` → authorize → confirm authorization.
- Unflagged: `APPROVED` → capture → `CAPTURED`.
- Flagged: `PENDING_REVIEW` → request one explanation/brief → notify first eligible contact. AI failure uses deterministic fallback text and does not block safety actions.

### Approval

Authenticate actor from signed link → validate payer confirmation, eligibility, deadline, and current state → atomically set `APPROVED` → capture using stored request ID → reconcile → record `CAPTURED` only on confirmation.

### Decline / payer cancellation

Validate → atomically set `DECLINED` → void → confirm `VOIDED` → notify payer and contacts.

### Self-dealing

Reject the attempted approval (Decision with `accepted = false`) → append audit event → route to the other eligible contact and notify them. If none exists, atomically decline and void. Do not route to Admin.

### Expiry

Scheduler finds overdue payment → Decision Service atomically sets `EXPIRED` → voids → records confirmed outcome → sends expiry notices.

## Access (decided)

All actors sign in with a **signed, expiring link** sent by email (HMAC over actor type, actor ID, optional payment ID, and expiry; 24-hour lifetime for review links). The link establishes a session cookie; actor identity is always read from the session, never from the request body. Decision idempotency keys make a reused link harmless. On the hosted demo, `/demo` creates an isolated scenario (one Payer row and its contacts, payees, and seed history; no extra table) and shows each actor's signed link on screen. Locally, the seed script does the same. Both are labelled demo-only.

## Demo timing (decided)

`DEMO_TIME_SCALE` defaults to `1`. With `360`, 12 hours becomes 2 minutes and 24 hours becomes 4 minutes, and the scan interval becomes 1 minute (the runner's minimum). The UI shows a visible "Demo timing ×360" badge whenever the scale is not 1. The standard 12/24-hour policy is tested separately with scale 1 using fake time in unit tests.

## Integrations and failure handling

- **PayPal:** prove a separate payee works on day 1, before UI work. Verify webhook signatures and deduplicate event IDs through `WebhookEvent`.
- **Separate-payee fallback (decided):** if the sandbox account cannot authorize and capture to a separate payee without partner permissions, the app's merchant account becomes the actual payee, the recipient lives only in application metadata, and this is disclosed in the video and Devpost entry.
- **Webhook candidates to verify:** `CHECKOUT.ORDER.APPROVED`, `PAYMENT.AUTHORIZATION.CREATED`, `PAYMENT.AUTHORIZATION.VOIDED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`. Validate actual availability and payloads in the sandbox.
- **Idempotency:** every PayPal command uses its stored request ID (`PayPal-Request-Id`). Local guards and reconciliation are still required.
- **Runner:** Trigger.dev, one scheduled task that calls the Decision Service. No payment policy in the runner.
- **Email:** Resend. Notification idempotency keys prevent duplicate logical sends; delivery failures never roll back a valid payment decision. Every notice is also shown in the scenario's in-app outbox (read from `Notification`), because judges do not own the seeded contact addresses. Missing Resend config is not an error.
- **Hosting:** Render (a hackathon sponsor tool) runs the app as one long-lived Node web service that serves the judges' sandbox demo URL. Neon stays the database, connected by `DATABASE_URL`, and the PayPal webhook is registered to the Render URL. A `render.yaml` blueprint describes the service so self-hosters can deploy it with one click. Use a paid instance (not the free tier) through judging, because free services sleep after inactivity and cold starts would delay webhooks and the first page load. Trigger.dev stays the scheduler. Local development uses a tunnel.
- **OpenAI:** two structured calls at most per send: the scam-pattern check at submission (only if text present) and one explanation/brief call per flagged payment. No tools, payment credentials, or decision fields beyond the one-way `match`.
- **Transaction Search:** optional, after the core demo works. Allow up to three hours of lag and 31-day coverage.

## Assumptions and open questions

- The 24-hour review deadline starts when authorization is confirmed.
- No mandatory minimum hold.
- EUR only.
- Authorization lifetime observed in sandbox: 29 days (`expiration_time`). The 24-hour window is well inside it.
- Separate payee (2026-10-16 proof): capture works, but void of a separate-payee authorization is refused (`403 PERMISSION_DENIED`). **The fallback is in effect.**
- Webhooks arrive late (up to ~40 s) and out of order, carrying current resource status. Treat each one as a prompt to GET the resource and reconcile; never move state backwards.
