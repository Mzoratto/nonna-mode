# Progress tracker — Nonna Mode

## Status

**Phase: Decision Service in place (2026-10-17). Next: Phase 2b, the screens (send, payment detail, contact inbox, sign-in, demo start).**

Checked items below are backed by evidence: see `evidence/2026-10-16-sandbox-proof.md` for the money-flow proof.

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
- [x] Repository scaffold (Next.js 16, strict TS), PayPal sandbox client, webhook route deployed on Render (2026-10-16).
- [x] Sandbox proof (2026-10-16): separate-payee capture works but its void is refused (`403 PERMISSION_DENIED`), so the fallback is in effect. Merchant-payee capture and void both confirmed by API and signature-verified webhooks. Request-ID replays are idempotent. Authorization lifetime is 29 days. Webhooks arrive late and out of order.
- [x] Durable records (2026-10-16): eight tables migrated on Neon `production`, with enums, CHECK constraints, unique idempotency keys, a partial index for in-flight operations, and an append-only audit trigger. Compare-and-set `transition()` with a central state-machine table. Deterministic seed. Webhooks are deduplicated in the DB. Tests on the Neon `test` branch: €200 boundary, one-way AI union, compare-and-set race, append-only audit, duplicate webhooks.
- [x] Decision Service (2026-10-17): send, buyer-approval/authorize, capture, void, payer confirm/cancel, contact decide, self-dealing reject + reroute (or decline when no one is eligible), escalate, expire, reconcile with stored request IDs. Webhooks trigger reconcile by reading PayPal. The one-way AI scam check fails closed. Deterministic fallback wording. Tests (Neon test branch, fake PayPal): required test 2 (approve vs expire: one winner, one PayPal mutation), required test 4 (injection/timeout keep or add holds), self-dealing reroute, missing payer confirmation, a lost capture response recovered with the same request ID. 60 tests, 5/5 consecutive green runs.
- [x] Hackathon rules review (2026-10-16): public MIT repository, hosted Render demo URL plus self-host instructions, `/demo` isolated scenarios, in-app outbox, sandbox buyer login published for judges.

## Not yet verified

- [ ] Signed-link sign-in route, session cookie, and review inbox UI (the token signing/verification is done and tested).
- [ ] AI scam-pattern check against the real OpenAI API (it is tested with faked responses; needs `OPENAI_API_KEY` and `OPENAI_MODEL`).
- [ ] Resend delivery.
- [ ] Runner startup and five-minute recovery scan.
- [ ] OpenAI wording validation and fallback.
- [ ] Public repository with a detectable MIT license.
- [ ] Render deployment (paid instance, `render.yaml`) with registered webhook; `/demo` scenarios and outbox.
- [ ] README self-host instructions tested from a clean clone.
- [ ] Recorded demo, Devpost write-up, and three-minute video (public on YouTube, no copyrighted music).

## Day-1 proof (done 2026-10-16; kept for reference)

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
- Add `/demo` scenario creation and the in-app outbox.

### Week 3 — recovery, notifications, and wording

- Configure the Trigger.dev scheduled task for startup and five-minute scans, including in-flight operation recovery.
- Implement Resend notices, 12-hour escalation, 24-hour expiry, and `DEMO_TIME_SCALE`.
- Add OpenAI explanation/brief generation with deterministic fallback.
- Deploy to Render from `render.yaml`, register the deployment-URL webhook, and point Trigger.dev at it.
- Reserve two to three days for UI polish (Design is a quarter of the score).

### Week 4 — evidence and submission

- Rehearse the scam decline and self-dealing scenes with real sandbox operations and demo timing.
- Record a three-minute video with visible sandbox status, demo-timing badge, and honest limitations.
- Write Devpost content and verify any external statistics and citations.
- Test the README setup from a clean clone; make the repository public with the MIT license visible.
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
| Storage | Neon Postgres; eight tables; Drizzle over `node-postgres`. Tests run on the Neon `test` branch. |
| Background work | One Trigger.dev scheduled task. |
| Notifications | Resend. |
| Separate payee fallback | **In effect** (2026-10-16 proof: separate-payee void refused). Merchant is the actual payee, recipient is metadata, disclosed. |
| Deployment | Render (sponsor tool) hosts the judges' sandbox demo URL on a paid instance; tunnel only for local development. |
| Repository | Public, MIT-licensed (hackathon rule). |
| Judge access | `/demo` creates isolated scenarios with on-screen signed links; in-app outbox; sandbox buyer login in the README. |

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

1. ~~Separate-payee support~~: capture yes, void no, so the fallback applies.
2. ~~Webhook coverage~~: ORDER.APPROVED, AUTHORIZATION.CREATED/VOIDED and CAPTURE.COMPLETED arrive, linked by resource ID; out of order. Still open: linking to a Payment via `custom_id` (Phase 1).
3. ~~Authorization lifetime~~: 29 days.
4. Will the recorded story use EUR throughout? (Default: yes.)
5. What is the hackathon theme text for the Stage One pass/fail check?
6. What do the sponsor-prize rules (section 8) require for Render? Check before deploying.

## Update rule

After each work session, record completed behavior, exact checks performed, redacted sandbox evidence, remaining failures, and any changed decisions. Do not mark a feature complete solely because code or a screen exists.
