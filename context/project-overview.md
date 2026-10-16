# Project overview — Nonna Mode

## Purpose and status

Nonna Mode is a sandbox-only PayPal web application for older users who need help reviewing suspicious sends. It is being built solo for the PayPal AI Hackathon, due November 12, 2026. Architecture and policy are defined; implementation and sandbox feasibility remain unverified.

It protects only payments initiated through Nonna Mode. Native PayPal activity is outside its control.

## Users

- **Payer:** an older user who creates sends, confirms flagged payments, receives explanations and outcomes, and reads the audit log.
- **Trusted contacts:** one or two people who review flagged sends. Neither can approve a payment to themselves.
- **Admin:** Marco, who configures sandbox accounts, contacts, and the payer's threshold.
- **Demo audience:** PayPal judges who need to understand the scam scenario, see a real authorization void, and see the self-dealing rule within three minutes.

## Goals

1. Demonstrate that a suspicious send can be authorized without capture.
2. Require joint consent before capturing a flagged send.
3. Reject a trusted contact's attempt to approve a payment to themselves.
4. Void declined or expired authorizations through the server-side authority.
5. Explain the outcome without blaming or alarming the payer.
6. Preserve a readable record of who did what.

The AI has two jobs. It runs a one-way scam-pattern check on the note or pasted message that can only **add** a hold reason, and it writes the calm explanation and contact brief. Deterministic rules decide everything else. The AI scam-pattern check can only add a hold reason. It can never remove a flag, approve, decline, capture, or void.

## Fixed policy

| Area | Rule |
|---|---|
| Flagging | New payee, amount above the configured threshold, payer marks unsure, or AI scam-pattern check matches; any one is sufficient. |
| AI check | One-way: can add a hold reason, never remove one. If text was provided and the check fails or times out, the send is held (`AI_CHECK_UNAVAILABLE`). |
| New payee | No earlier `CAPTURED` payment from this payer to this payee. |
| Threshold | Default €200, set at setup. The amount comparison is strictly greater than. |
| Payment path | Every send uses Orders v2 `intent: AUTHORIZE`. Unflagged sends are captured immediately after authorization. |
| Flagged sends | Use Orders v2 `intent: AUTHORIZE`; no capture before joint consent. |
| Joint consent | Payer confirmation plus approval from one eligible trusted contact. Approval covers the full amount. |
| Self-dealing | Match payee email or PayPal account against the deciding contact. Reject that approval, route to the other contact, or decline if none is eligible. |
| Escalation | Notify the first contact immediately; notify the second after 12 hours without a decision. After that, either contact may decide; first valid decision wins. |
| Expiry | At 24 hours without a valid decision, expire and void. Silence never permits capture. |
| Races | Atomic state transition; first valid terminal review decision wins. |
| Audit | Append-only event for every state change, including actor, time, and previous/new state. |

There is no mandatory 24-hour minimum hold in the latest rules. Valid joint consent can release a payment before expiry.

## Core flow

1. The payer enters recipient, amount, note, and an optional unsure selection.
2. The Decision Service writes a Payment record, runs the AI scam-pattern check if a note or pasted message was given, and combines its result with the deterministic rules.
3. For every send, PayPal buyer approval is followed by authorization. An unflagged send is then captured immediately.
4. For a flagged send, once authorization is confirmed, the service opens review, stores the explanation and brief, and notifies the first eligible contact.
5. The payer confirms the send. A contact may approve only if the payer has confirmed and the contact is eligible.
6. Approval permits capture. Decline permits void. No review decision by 24 hours causes expiry and void.
7. The UI reports the confirmed financial outcome and exposes the audit history.

The note or pasted message is untrusted input. The AI check may add a hold because of it; nothing in it can release a hold.

## Minimum demo scope

| Feature | Demo purpose | Component/API |
|---|---|---|
| Seeded payer, two contacts, payees, and history | Avoid onboarding work | Postgres and setup scripts |
| Large-text send form and PayPal buyer approval | Start the bail-payment scene | Web app; Orders v2 |
| Flagging and held status | Show why capture has stopped | Decision Service; authorization API |
| AI scam-pattern check | Pasted bail message triggers the hold on its own | OpenAI through Decision Service |
| Calm explanation and short brief | Explain the pause to both users | OpenAI through Decision Service |
| Payer confirmation and contact review | Demonstrate the second key | Web app; Decision Service |
| Decline and confirmed void | Show money was not captured | PayPal void operation |
| Self-dealing rejection and rerouting | Demonstrate the anti-guardian rule | Decision Service; contact inbox; email |
| Audit view | Show who approved or declined | Postgres; web app |
| Durable escalation and expiry | Prevent unanswered holds from releasing | Trigger.dev task; Decision Service |
| Demo time scale | Show 12h/24h behavior within the video | `DEMO_TIME_SCALE` with visible badge |

Email (Resend) is part of the current canvas and also delivers signed sign-in links. Seeded identities and a minimal review inbox reduce setup work but do not replace required notifications.

## Non-goals and deferred work

- Native PayPal, other payment apps, banks, cards, or real-money protection.
- Production launch, compliance, licensing, or production-grade account onboarding.
- Mobile applications or a full account-monitoring dashboard.
- Voice-call analysis, voice-clone detection, and family passphrases.
- AI-agent spending controls, trained ML scoring models, AI that can remove a hold, or any AI payment authority.
- Partial approvals, reauthorization, and complex policy customization.
- Transaction Search baselines before the core demo works.
- Splnit, AgentOS, or Mandate as product components or pitch dependencies.

AgentOS and Mandate may be build tools only.

## Success criteria

- A separately recorded proof captures one sandbox authorization and voids another, with verified webhook handling.
- The primary demo shows a real held authorization followed by a real void.
- A contact's self-approval is rejected server-side and appears in the other eligible contact's inbox.
- Duplicate decisions, webhook deliveries, and scheduled jobs cannot cause duplicate financial actions.
- No UI claims a payment was sent or voided while the provider result is unknown.
- The log identifies actors and outcomes in plain language.
- The video and Devpost entry explicitly disclose sandbox use and the Nonna Mode-only protection boundary.

## Assumptions and open questions

- EUR throughout the implementation and the recorded story.
- Confirm separate-payee support, authorization timing, and webhook coverage in the sandbox. If separate payee fails, use the decided merchant-payee fallback and disclose it.
- Verify and cite any financial-loss statistics before including them in the submission. The supplied problem statement is not a verified source.
