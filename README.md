# Nonna Mode

**A second pair of eyes before the money leaves.** When an older person is about to send money that looks risky (a new recipient, a large amount, or a message that sounds like the "grandson in jail" scam), Nonna Mode asks PayPal to **hold** the payment instead of sending it. Nothing is sent until the sender confirms **and** one trusted family member approves. A family member can never approve a payment to themselves, and an unanswered payment is cancelled, never sent.

Built solo for the **PayPal AI Hackathon** (deadline 12 Nov 2026). PayPal **sandbox** only.

> **Protection boundary:** Nonna Mode protects payments made *through Nonna Mode*. It does not protect payments made in the PayPal app or anywhere else.

---

## Try it (no setup)

**Live demo:** https://nonna-mode.onrender.com/demo

1. Click **Start a demo**. You get your own family: **Rosa** (sends money) and her children **Luca** and **Giulia** (trusted contacts), each with a sign-in link. Open each person in a **separate browser profile or private window** so they stay signed in side by side.
2. When PayPal asks Rosa to log in, use the **PayPal sandbox buyer** account:
   - Email: `sb-3h1xy53099131@personal.example.com`
   - Password: `@O97sUu?`

   (A sandbox test account. No real money exists.)
3. Play the two scenes:

**Scene 1: the "grandson in jail" scam**
- As **Rosa**: Send money → **Avv. Ferri** → **2000** → "What is the money for?" `Matteo's bail` → "Did someone call or message you?" **Yes** → paste:
  `Nonna it's me Matteo. I had a car accident and the police are keeping me. Please don't tell mamma. The lawyer needs €2,000 for bail today.`
- Approve in PayPal. Rosa sees **"We paused this payment"**: PayPal is holding the money, the AI explains the bail-scam pattern, and Rosa can call Luca. Tap **Yes, send it**.
- As **Luca**: open the request, read the AI brief, write a message to Rosa, and tap **Decline**. PayPal **voids** the authorization and Rosa sees **"Your money was not sent"** with Luca's message.

**Scene 2: the self-dealing safeguard**
- As **Rosa**: send **€900** to **Luca Bianchi**, approve in PayPal, tap **Yes, send it**.
- As **Luca**: try to **Approve** it. It is refused: *nobody can approve a payment to themselves*. The request goes to **Giulia**.
- As **Giulia**: approve it. PayPal **captures** the payment.

Every person can open **See what happened**: an append-only history of who did what. The **outbox** link on `/demo` shows the email notices (demo contacts use reserved `example.com` addresses, so notices appear in-app).

---

## How it works

```mermaid
flowchart LR
  R[Rosa sends money] --> F{Risky?<br/>new payee · above €200 ·<br/>unsure · AI scam pattern}
  F -- no --> A1[PayPal authorize] --> C1[capture immediately]
  F -- yes --> A2[PayPal authorize<br/>money held, not sent]
  A2 --> RC{Rosa confirms<br/>+ one eligible contact approves}
  RC -- approved --> C2[PayPal capture]
  RC -- declined / cancelled --> V[PayPal void]
  A2 -- 24 h, no decision --> V
```

**PayPal (sandbox).** Every send is an **Orders v2 `intent: AUTHORIZE`** order. Risky sends stay authorized, so the money is reserved but not sent, until joint consent; then the app **captures**. A decline, a cancellation or 24 hours of silence **voids** the authorization. Every mutation carries a stored **`PayPal-Request-Id`**, so a retry can never double-capture. **Webhooks** are signature-verified (`verify-webhook-signature`), stored once by event ID, and only *prompt* the app to read the real status from PayPal, because they arrive late and out of order.

**AI (OpenAI), with no payment authority.**
1. **Scam-pattern check:** reads the note or pasted message (as untrusted data) and can only **add** a hold (`EMERGENCY_OR_BAIL`, `IMPERSONATION`, `URGENCY_OR_SECRECY`, `GIFT_CARD_OR_CRYPTO`). It can never remove one. If the check fails or times out while text is present, the send is **held anyway**.
2. **Wording:** writes the calm explanation for the payer and the factual brief for the contact. It is length-capped, text claiming "definitely a scam" or telling anyone to approve is rejected, and deterministic text is used if the call fails.

A prompt injection in the pasted message can, at worst, cause an extra hold, never a release.

**Rules the code enforces** (and the tests check):
- A payment row exists **before** any PayPal call, so no authorization can be lost after a crash.
- State changes are single **compare-and-set** updates; if approve and expire race, exactly one wins and at most one PayPal call is made.
- Capture only from `APPROVED`; void only from `DECLINED`/`EXPIRED`. **Silence never releases money.**
- A trusted contact can't approve a payment to their own email or PayPal account; the request reroutes to the other contact, or is declined if there is none.
- The 12 h escalation and 24 h expiry run from a once-a-minute **recovery scan** (Trigger.dev), which also finishes any PayPal call interrupted by a timeout or crash, using the stored request ID.
- The audit log is **append-only** at the database level (a trigger rejects UPDATE/DELETE).

---

## Honest limitations

- **Sandbox only.** No real money moves; production PayPal credentials are refused at startup.
- **Merchant-as-payee fallback.** Our sandbox proof showed a merchant can *capture* to a separate payee but is **refused when voiding** a separate payee's authorization (`403 PERMISSION_DENIED`). Voiding is essential here, so the app's own merchant account is the actual PayPal payee and the intended recipient exists only in Nonna Mode's records. See [`evidence/2026-10-16-sandbox-proof.md`](evidence/2026-10-16-sandbox-proof.md).
- **Demo sign-in.** People sign in with signed, expiring links. `/demo` shows them on screen (demo only), and emails carry them in real use.
- **Shortened timers in the video.** `DEMO_TIME_SCALE=360` turns 12 h / 24 h into 2 / 4 minutes; the UI shows a "Demo timing ×360" badge whenever it isn't 1.
- **Demo emails.** Demo contacts use reserved `example.com` addresses, so notices appear in the in-app outbox. With `DEMO_EMAIL_OVERRIDE`, they are delivered to one real inbox via Resend.

---

## Run it yourself

**You need:** Node 24+, Docker (or any Postgres 14+), and a PayPal developer account (free).

```bash
git clone https://github.com/Mzoratto/nonna-mode.git && cd nonna-mode
npm ci

# 1. A database
docker run -d --name nonna-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=nonna -p 5432:5432 postgres:16

# 2. Configuration
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Required | What |
|---|---|---|
| `DATABASE_URL` | yes | `postgresql://postgres:postgres@localhost:5432/nonna` |
| `APP_BASE_URL` | yes | `http://localhost:3000` |
| `SESSION_SECRET` | yes | 32+ random characters (`openssl rand -base64 48`) |
| `PAYPAL_ENV` | yes | `sandbox` (anything else is refused) |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | yes | developer.paypal.com → **Sandbox** → Apps & Credentials → Create App |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | recommended | Without them every send with a note is held as "check unavailable" (fails safe) and explanations use built-in text |
| `PAYPAL_WEBHOOK_ID` | optional | Needs a public URL (e.g. a tunnel) registered as a webhook. Without it the PayPal return page and the recovery scan still finish every payment |
| `SCAN_SECRET` | optional | Protects `POST /api/internal/scan` (the recovery scan; it also runs once at startup) |
| `RESEND_API_KEY`, `EMAIL_FROM`, `DEMO_EMAIL_OVERRIDE` | optional | Real email; otherwise notices are shown in the in-app outbox |
| `DEMO_TIME_SCALE` | optional | `360` = 12 h/24 h become 2/4 min |

```bash
# 3. Schema, demo data, run
npm run db:migrate
npm run seed          # prints demo-only sign-in links for Rosa, Luca, Giulia
npm run build && npm start   # or: npm run dev
```

Open http://localhost:3000/demo → **Start a demo**, or use the links printed by `npm run seed`. To run escalation/expiry locally without Trigger.dev, call the scan:
`curl -X POST -H "Authorization: Bearer $SCAN_SECRET" http://localhost:3000/api/internal/scan`.

**Checks:** `npm run typecheck && npm run lint && npm test && npm run build`. Database tests need `DATABASE_URL_TEST` pointing at a **separate, disposable** database (they truncate tables and refuse to run against `DATABASE_URL`). Without it they are skipped.

---

## Evidence, docs, structure

- [`evidence/2026-10-16-sandbox-proof.md`](evidence/2026-10-16-sandbox-proof.md): real sandbox capture/void proof, idempotency, webhook timing, the payee finding.
- [`evidence/2026-10-17-render-e2e.md`](evidence/2026-10-17-render-e2e.md): both scenes end to end on the deployed app with real PayPal, OpenAI and Resend.
- [`context/`](context/): architecture, policy, UI and code standards. [`context/progress-tracker.md`](context/progress-tracker.md) separates verified work from planned work.

```
src/server/decision/   the Decision Service: the only code that moves money (service, transitions, scan, flagging, eligibility)
src/server/paypal/     Orders v2 / Payments client (sandbox only)
src/server/explanations/  AI scam check + wording (one-way, with fallbacks)
src/server/notifications/ email (Resend) + notice templates
src/server/db/         Drizzle schema (8 tables) + node-postgres client
src/app/               Next.js screens and route handlers
src/trigger/           the one scheduled task (recovery scan)
test/                  vitest; DB tests run against a separate Postgres
```

**Stack:** Next.js 16 · TypeScript (strict) · Postgres (Neon) with Drizzle · PayPal Orders v2 / Payments · OpenAI · Trigger.dev · Resend · hosted on Render. Typeface: Atkinson Hyperlegible Next, designed for low-vision readers.

## License

[MIT](LICENSE)
