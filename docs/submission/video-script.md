# Video script: Nonna Mode (≤ 3:00)

**Rules (hackathon):** under 3 minutes, public on YouTube, shows the app actually working, **no copyrighted music** and no third-party material without permission (no PayPal logo graphics; showing PayPal's own sandbox approval page in the screen recording is the real product flow). English.

**Setup before recording**
- Render: `DEMO_TIME_SCALE=360` (escalation ≈ 2 min, expiry ≈ 4 min; the UI shows **"Demo timing ×360"**). Set it back to `1` afterwards.
- Render: `DEMO_EMAIL_OVERRIDE=<your inbox>` so the emails arrive on camera.
- Start a fresh family at `/demo`. Three browser windows side by side at phone width (≈ 390 px): **Rosa**, **Luca**, **Giulia**, plus your mail client.
- Recordings to capture separately, then cut: Scene 1, Scene 2, and the **expiry** run (start a third payment, leave it unanswered for ~4 min, film the start and the end).
- Voice-over only (or royalty-free/self-made sound). Captions on screen for every key line.

---

## 0:00–0:15 · The call (hook)
**Screen:** black, then a phone message appears line by line:
> *"Nonna it's me Matteo. I had a car accident and the police are keeping me. Please don't tell mamma. The lawyer needs €2,000 for bail today."*

**VO:** "This is the 'grandchild in trouble' scam. It works because it's urgent, it's secret, and it sounds like family."
**Caption:** *In 2025, people over 60 reported $7.7 billion in fraud losses to the FBI.* (Source: FBI IC3 2025 Annual Report, p. 44)

## 0:15–0:30 · What Nonna Mode is
**Screen:** Nonna Mode landing page → Rosa's home.
**VO:** "Nonna Mode is a calm way to send money with PayPal. When a payment looks risky, it asks PayPal to **hold** it instead of sending it. Nothing leaves until Rosa confirms **and** someone she trusts says yes."
**Caption (persistent, small):** *PayPal sandbox demo · protects payments made through Nonna Mode only.*

## 0:30–1:25 · Scene 1: the bail scam is stopped
1. **Rosa:** Send money → **Avv. Ferri** ("New. You have never paid them.") → keypad **2000** → "Did someone call or message you?" **Yes** → pastes the message → Continue to PayPal.
   **VO:** "Rosa pays a lawyer she's never paid, and pastes the message she got."
2. **PayPal sandbox approval** (quick cut) → back in Nonna Mode: **"We paused this payment."**
   **VO:** "PayPal authorizes the payment, so the money is reserved but **not sent**. Our AI read the message and recognised the bail-scam pattern. It can only *add* a hold, never remove one."
   **Highlight:** the amber box ("asks for bail money today and says not to tell anyone") and "Nothing has been sent."
3. Rosa taps **Yes, send it**. **Mail client:** Luca's review email arrives.
4. **Luca:** the review screen: **Scam pattern: emergency / bail** with the AI brief and the quoted message; "Before you decide: try calling…" Luca types *"Mamma, I called Matteo. He's fine and at work. Please call me."* → **Decline**.
   **VO:** "Luca calls Matteo: he's fine. Luca declines."
5. **Rosa:** **"Your money was not sent"**, "PayPal confirmed it…", Luca's message.
   **VO:** "PayPal voids the authorization. Not a cent left Rosa's account."

## 1:25–2:05 · Scene 2: nobody can approve a payment to themselves
1. **Rosa:** sends **€900** to **Luca Bianchi** → PayPal → **Yes, send it** (screen says *Giulia* will check it).
2. **Luca:** opens it, taps **Approve** → **"Your approval wasn't accepted."**
   **VO:** "What if the person you trust is the one asking? Luca tries to approve a payment to his own account. The server refuses, every time, for every contact."
3. **Giulia:** her inbox shows the request with *"This payment is to another trusted contact's account"* → **Approve** → Rosa sees **Payment sent**.
   **VO:** "It goes to Giulia instead. She approves, and only now does PayPal capture."

## 2:05–2:25 · Silence never sends money
**Screen:** a third payment left unanswered, with the **"Demo timing ×360"** badge visible. Cut: after ~2 min Giulia is asked too; after ~4 min Rosa sees "Your money was not sent… Nobody approved it in time."
**VO:** "If nobody answers, the second contact is asked after 12 hours, and after 24 hours the payment is cancelled. Here the clock is sped up 360 times. Silence never releases money."

## 2:25–2:50 · How it's built
**Screen:** "What happened" history → quick montage: README flow diagram, `evidence/` files, tests passing.
**VO:** "Under the hood, every send is a PayPal Orders v2 **authorize**. Capture and void happen only on the server, with stored PayPal request IDs, so a retry can never pay twice. Webhooks are signature-verified, and the app always reads the real status back from PayPal. Every step lands in a history nobody can edit. We proved capture and void against the real sandbox before writing a single screen."

## 2:50–3:00 · Close + disclosures
**Screen:** title card.
**VO:** "Nonna Mode. A second pair of eyes before the money leaves."
**On-screen disclosures (readable for ≥ 3 s):**
- PayPal **sandbox**; no real money.
- Protects only payments made **through Nonna Mode**, not the PayPal app.
- In this demo the app's merchant account receives the money; the recipient is shown from Nonna Mode's records (PayPal refused voids for separate payees in sandbox).
- Demo sign-in links; timers shown at ×360.
