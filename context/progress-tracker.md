# Progress tracker — Nonna Mode

## Status

**Phase: architecture defined; sandbox feasibility not yet verified.**

This tracker records only work supported by the saved brief and canvas. No repository inspection, code execution, API calls, or successful tests are established here.

Submission deadline: **November 12, 2026** (about four weeks of solo work).

## Completed discovery and design

- [x] Defined payer, trusted-contact, and admin roles.
- [x] Limited protection to sends initiated through Nonna Mode.
- [x] Chose a single Next.js and strict TypeScript web application with Postgres.
- [x] Defined flagging: new payee, amount above threshold, unsure, or one-way AI scam-pattern match.
- [x] Set default threshold to €200 (strictly greater than).
- [x] Defined joint consent and full-amount approval.
- [x] Defined self-dealing rejection and alternate-contact routing.
- [x] Defined immediate notification, 12-hour escalation, and 24-hour expiry.
- [x] Defined atomic state transitions, idempotency, and append-only audit.
- [x] Limited all PayPal payment authority to the Decision Service.
- [x] Limited OpenAI to a one-way scam-pattern check (can only add a hold) and explanation/brief generation (2026-10-16, option B).
- [x] Documented a 10-component, 13-connection architecture with explicit Email → Payer and Email → Contacts paths.
- [x] Blueprint review fixes (2026-10-16): one `Payment` table for every send, written before any PayPal call; added `AWAITING_BUYER`, `AUTHORIZING`, `ABANDONED` states; one AUTHORIZE-only payment path; recovery scan covers in-flight operations; decided new-payee definition, signed-link access, Resend, demo time scale, both contacts may decide after escalation, and the separate-payee fallback; trimmed the required test set.

## Not yet verified

- [ ] Repository scaffold and local commands.
- [ ] Separate-payee order creation, authorization, and capture.
- [ ] Successful void of a separate authorization.
- [ ] Actual webhook coverage, signature verification, and duplicate handling.
- [ ] Authorization lifetime in the sandbox.
- [ ] Database migrations and seed data.
- [ ] Atomic approval/decline/expiry races.
- [ ] Signed-link access and review inbox.
- [ ] Resend delivery.
- [ ] Runner startup and five-minute recovery scan.
- [ ] AI scam-pattern check: schema, one-way union, timeout → hold.
- [ ] OpenAI wording validation and fallback.
- [ ] Recorded demo, Devpost write-up, and three-minute video.

## Immediate next step: one- to two-day proof

Before writing UI:

1. Configure the app's sandbox merchant credentials, a buyer (payer) account, and a separate recipient account.
2. Create an Orders v2 `intent: AUTHORIZE` order naming that recipient as payee.
3. Complete buyer approval and authorize it.
4. Capture it and inspect the resulting financial status.
5. Repeat with another order and void its authorization.
6. Receive and verify actual webhooks, recording event IDs and resource mappings.
7. Retry one call with the same `PayPal-Request-Id` and confirm no duplicate operation.

**Exit criterion:** evidence of one confirmed capture and one confirmed void.

**If the separate payee fails:** spend at most half a day isolating whether it is permissions, request shape, or account routing. Then switch to the decided fallback (merchant account as actual payee, recipient as metadata, disclosed) and continue. Do not let this block week 1.

## Build order

### Week 1 — payment feasibility and durable records

- Finish the sandbox proof first.
- Scaffold the single application and Neon migrations for the eight tables.
- Seed one payer, two contacts, recipient identities, and minimal history (real sandbox captures or rows marked `is_seed`).
- Implement the PayPal adapter (AUTHORIZE, capture, void, GET), webhook verification and `WebhookEvent` deduplication, stored request IDs, and audit records.

### Week 2 — core decision flow

- Implement flagging (deterministic rules plus the one-way AI scam-pattern check) and the shared AUTHORIZE path (unflagged → immediate capture; flagged → review).
- Implement payer confirmation and atomic review transitions.
- Implement self-dealing rejection, rerouting, decline, capture, and void.
- Implement signed-link sign-in.
- Add payer send/status screens, contact inbox, and plain-language log.

### Week 3 — recovery, notifications, and wording

- Configure the Trigger.dev scheduled task for startup and five-minute scans, including in-flight operation recovery.
- Implement Resend notices, 12-hour escalation, 24-hour expiry, and `DEMO_TIME_SCALE`.
- Add OpenAI explanation/brief generation with deterministic fallback.

### Week 4 — evidence and submission

- Rehearse the scam decline and self-dealing scenes with real sandbox operations and demo timing.
- Record a three-minute video with visible sandbox status, demo-timing badge, and honest limitations.
- Write Devpost content and verify any external statistics and citations.
- Freeze scope and run the final checks before November 12.

## Decision register

| Decision | Current position |
|---|---|
| Product boundary | Sandbox; Nonna Mode-created sends only. |
| Flagging | New payee, amount above configured threshold, payer unsure, or AI scam-pattern match. |
| New payee | No earlier `CAPTURED` Payment from this payer to this payee. |
| Default threshold | €200, strictly greater than. |
| Payment path | Every send uses `intent: AUTHORIZE`; unflagged sends are captured immediately. |
| Records | One `Payment` row per send, written before any PayPal call. |
| AI role | One-way scam-pattern check (adds a hold only; fails closed when text is present) plus explanation text. No payment authority. |
| Approval | Payer confirmation plus one eligible contact; whole amount. |
| After escalation | Both eligible contacts may decide; first valid decision wins. |
| Self-dealing | Reject matching contact; route to another or decline. |
| Timing | Immediate notice; 12-hour escalation; 24-hour expiry. |
| Demo timing | `DEMO_TIME_SCALE` (360 for recording), visible badge, disclosed. |
| Minimum waiting time | None. |
| Payment authority | Decision Service only. |
| Access | Signed, expiring email links for all actors; session cookie. |
| Storage | Neon Postgres; eight tables. |
| Background work | One Trigger.dev scheduled task. |
| Notifications | Resend. |
| Separate payee fallback | Merchant as actual payee, recipient as metadata, disclosed. |
| Deployment | Local-first; webhook tunnel needed; no hosting decision made. |

## Top risks and fallbacks

| Risk | Mitigation and honest fallback |
|---|---|
| Separate recipient cannot be used with available permissions | Test on day 1; half-day cap; then decided fallback, disclosed. |
| Slow webhooks or uncertain API responses obscure the live result | Read API responses and reconcile provider resources; rehearse with fresh orders. Never fabricate a successful void. |
| Races or crashes cause duplicate capture or a lost authorization | Payment row before PayPal calls, stored request IDs, atomic transitions, recovery scan of `pending_operation`. |
| AI check over-flags normal sends | Acceptable: a false positive only costs a review. Tune the prompt with a few seeded examples; never add an AI path that unflags. |
| Four weeks is tight for one person | Keep the required test set small (below); drop Transaction Search and polish first. |

## Required tests (minimum)

1. Flagging boundary: €200.00 not flagged by amount, €200.01 flagged.
2. Approve and expire racing on the same payment: exactly one wins, at most one PayPal mutation.
3. Duplicate webhook delivery: processed once, no second state change.
4. AI is one-way: `match: false` or injected text never removes a reason; AI timeout with text present holds the send.

Nice to have if time allows: self-dealing reroute, payer-confirmation-missing approval, approve vs decline race, AI fallback wording.

## Open questions

1. Does separate-payee authorization work in the sandbox? (Day-1 proof answers this.)
2. Which webhook events actually arrive, and how are they linked to Payments?
3. What authorization lifetime does the sandbox report?
4. Will the recorded story use EUR throughout? (Default: yes.)

## Update rule

After each work session, record completed behavior, exact checks performed, redacted sandbox evidence, remaining failures, and any changed decisions. Do not mark a feature complete solely because code or a screen exists.
