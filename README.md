# Nonna Mode

Nonna Mode is a PayPal sandbox web application for reviewing suspicious sends before money is captured. It is a solo entry for the PayPal AI Hackathon, with a submission deadline of **November 12, 2026**.

**Protection applies only to sends created through Nonna Mode. It does not protect sends made in the native PayPal app.**

## Purpose

A flagged send creates a PayPal authorization rather than an immediate capture. Releasing it requires the payer's confirmation and one eligible trusted contact's approval. A contact cannot approve a payment to their own email or PayPal account.

The AI does two jobs. First, it reads the note or a pasted message and can **add** a hold when it recognizes a scam pattern (for example an urgent bail or family-emergency request). It can only make a send stricter: it can never remove a flag, approve, decline, capture, or void. Second, it writes the calm explanation for the payer and the short brief for the contact.

## Current status

The project has a defined architecture and payment policy. No implementation, sandbox API behavior, webhook delivery, or deployment has been verified by this context package.

The first task is a sandbox feasibility test, not UI development:

1. Create an Orders v2 order with `intent: AUTHORIZE` and a separate sandbox payee.
2. Complete buyer approval and authorize it.
3. Capture one authorization and void a separate authorization.
4. Verify API responses and corresponding webhooks.
5. Confirm authorization and capture timing constraints before enabling the 24-hour expiry policy.

If separate-payee authorization is not supported by the available account configuration, spend at most half a day isolating the cause, then use the decided fallback: the application's merchant account is the actual payee and the recipient exists only in application metadata. This is a weaker demonstration and is disclosed in the video and Devpost entry.

## Fixed behavior

- Every send uses Orders v2 `intent: AUTHORIZE`. Unflagged sends are captured immediately after authorization; flagged sends wait for review.
- Every send gets a `Payment` record before any PayPal call, so no authorization can be lost after a crash.
- Flag a send if the payee is new (no earlier captured payment from this payer to them), the amount is above the payer's threshold, the payer marks it as unsure, or the AI scam-pattern check recognizes a scam pattern in the note or pasted message.
- The AI check is one-way: it can add a hold, never remove one. If text was provided and the check fails or times out, the send is held anyway.
- Default threshold: **€200**, configurable at setup. Exactly €200 does not trigger the amount rule.
- Flagged sends are authorized and held; they are not captured before approval.
- Approval requires payer confirmation plus one eligible contact's approval for the whole amount.
- Reject self-dealing approval and route to the other contact; decline if no eligible alternative exists.
- Notify the first contact immediately, the second after 12 hours without a decision, and expire unresolved holds after 24 hours. After escalation, either contact may decide; the first valid decision wins.
- Expiry means void, never automatic capture.
- Record every state change in an append-only audit log.

## Planned stack

- Next.js with strict TypeScript: one web application and server-side Decision Service.
- Neon Postgres: relational metadata.
- PayPal Orders v2 and payment APIs: sandbox authorization, capture, void, and webhooks.
- Trigger.dev: one scheduled task as the single durable background runner.
- OpenAI: one-way scam-pattern check (can only add a hold) and explanation text. No payment authority.
- Resend: email notifications and signed sign-in links.

No file storage, vector database, extra backend service, or mobile application is required.

## Local setup

These are setup requirements, not claims that scripts already exist.

1. Create a **public** GitHub repository with an MIT `LICENSE` (a hackathon requirement), separate from Splnit, AgentOS, and Mandate. Never commit secrets.
2. Scaffold one Next.js application with strict TypeScript and commit its lockfile.
3. Configure a development Neon database and apply versioned migrations.
4. Create PayPal sandbox application credentials and payer/payee test accounts.
5. For local development, configure a public HTTPS tunnel to the local webhook endpoint and register that URL with PayPal. The hosted demo on Render registers its stable deployment URL instead.
6. Configure OpenAI, Trigger.dev, and Resend.
7. Seed one payer, two contacts, recipient identities, and minimal payee history.
8. Run the sandbox money-flow proof before building the review interface.

Proposed server-side configuration:

```dotenv
DATABASE_URL=
APP_BASE_URL=http://localhost:3000
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_WEBHOOK_ID=
OPENAI_API_KEY=
OPENAI_MODEL=
TRIGGER_SECRET_KEY=
RESEND_API_KEY=
EMAIL_FROM=
SESSION_SECRET=
DEMO_TIME_SCALE=1
```

Keep secrets out of browser bundles, source control, screenshots, and recordings. Pin actual environment variable names and installation commands when the scaffold is created.

## Using the demo

1. Open the seeded payer's send screen and select a known test recipient.
2. Enter an amount and note, or paste the message you received. Use a new recipient, an amount above €200, the unsure option, or a pasted "grandson in jail, send bail now" message to trigger a hold.
3. Complete PayPal's buyer approval. Show a held status only after authorization is confirmed.
4. Read the calm explanation and submit the payer's explicit confirmation.
5. Open the eligible contact's review screen and approve or decline.
6. Show capture or void only after PayPal confirms the operation.
7. Repeat with a contact's own payee identity to demonstrate rejection and rerouting.
8. Open the payer's plain-language audit log.

On the hosted demo, open `/demo` and start a fresh demo: it creates an isolated payer, two contacts, and payees, and shows each actor's signed sign-in link. Notices appear in the demo's in-app outbox (and are also emailed through Resend when configured). Locally, the seed script issues the same links. Set `DEMO_TIME_SCALE=360` to show escalation (2 minutes) and expiry (4 minutes) during recording; the UI then shows a visible demo-timing badge.

Seed users and history, but never fabricate successful PayPal operations. Seeded history rows are marked as seed data.

## Scope and submission

The deliverables are a working sandbox demo, a Devpost write-up, and a three-minute video led by the scam story and the self-dealing safeguard. Real money, native PayPal protection, production launch (the Render deployment is a sandbox demo), compliance work, voice analysis, and account-monitoring dashboards are out of scope.

Hackathon submission requirements (from the official rules):

- Public repository with a detectable open-source license (MIT) in the About section.
- A working demo judges can use: the hosted Render URL, plus complete self-host instructions in this README (and a `render.yaml` blueprint for one-click deployment). Include the PayPal sandbox **buyer** test login judges need; never publish API secrets.
- A demo video under three minutes, public on YouTube, showing the app working end-to-end, with no copyrighted music or unlicensed third-party material.
- An English text description of the features and functionality.

See `context/project-overview.md`, `context/architecture-context.md`, `context/ui-context.md`, `context/code-standards.md`, `context/ai-workflow-rules.md`, and `context/progress-tracker.md` for implementation context.
