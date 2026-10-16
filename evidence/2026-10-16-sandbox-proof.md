# Sandbox money-flow proof — 2026-10-16

Phase-0 evidence: real PayPal **sandbox** calls made by `scripts/proof.ts`, with webhooks received by the Render deployment (`/api/paypal/webhook`). No mocks. Provider IDs are shortened to their last five characters. Raw JSONL stays in `evidence/raw/` (gitignored).

## Accounts

| Role | Sandbox account |
|---|---|
| App / merchant | Business account linked to the `nonna-mode` REST app |
| Buyer (payer) | Personal account, CZ (balance in CZK; PayPal converted to EUR) |
| Separate recipient | Second Business account (`…@business.example.com`, merchant `…FYAN`) |

Every order was €10.00, Orders v2 `intent: AUTHORIZE`, and every mutation sent a `PayPal-Request-Id`.

## Runs

| # | Mode | Payee | Order | Authorization | Result |
|---|---|---|---|---|---|
| 1 | capture | separate recipient (email) | `…8412K` | `…2582K` | **CAPTURED**: capture `…6992Y` COMPLETED; capture payee = recipient (`…FYAN`); €0.69 fee, €9.31 net to recipient |
| 2 | void | separate recipient (email) | `…9605K` | `…12119` | **Void refused**: `403 NOT_AUTHORIZED / PERMISSION_DENIED` (debug_id `ca4b84c08280f`) |
| 3 | void | app merchant (no payee) | `…4962C` | `…5401J` | **VOIDED**: confirmed by API and webhook |
| 4 | capture | app merchant (no payee) | `…76643` | `…2971C` | **CAPTURED**: capture `…39134` COMPLETED; payee is the app merchant |

Run 2's authorization cannot be voided by us. It stays `CREATED` until PayPal expires it on 2026-11-14. Sandbox only; no action needed.

## Findings

1. **Separate payee: capture works, void does not.** A merchant can create, authorize and capture an order whose payee is another account. Voiding that authorization needs permissions the app doesn't have (partner / third-party permissions). Nonna Mode must be able to void declined and expired sends, so the **decided fallback is now in effect**: the app's merchant account is the actual payee and the intended recipient exists only in application metadata. Disclose this in the video and Devpost entry.
2. **Authorization lifetime:** `expiration_time` = create + **29 days** on every run. The 24-hour review window is well inside it. The 3-day honor period was not measured, because we don't capture late.
3. **Idempotency:** replaying authorize, capture and void with the same `PayPal-Request-Id` returned the same resource ID and status every time. No duplicates were created.
4. **Webhooks:** all subscribed (`*`); signatures verified (`verified:true`) for every real event. Simulator events can never verify; we expected and observed that.

   | Event | Seen | Delay after event |
   |---|---|---|
   | `CHECKOUT.ORDER.APPROVED` | runs 1–4 | ~1 s to ~40 s |
   | `PAYMENT.AUTHORIZATION.CREATED` | runs 1–4 | 6–16 s |
   | `PAYMENT.CAPTURE.COMPLETED` | runs 1, 4 | 8–15 s |
   | `PAYMENT.AUTHORIZATION.VOIDED` | run 3 | ~1 s |

5. **Webhooks arrive out of order and carry current status, not the status at event time.** Example: run 3's `AUTHORIZATION.CREATED` arrived *after* `AUTHORIZATION.VOIDED`, already showing `VOIDED`. Run 1's capture event arrived before its authorization event. So webhooks must never drive state backwards: treat them as a prompt to read the resource (GET) and reconcile.
6. **Buyer approval:** authorize succeeded 1.2–2.3 s after the script saw the order as `APPROVED`. Delays are measured from `event_create_time` to the Render log timestamp. Logging in as the payee account fails with `CANNOT_PAY_SELF`, which is useful for testing the self-payment edge case.

## Exit criterion

Met for the fallback mapping that the product will use: one confirmed capture (run 4) and one confirmed void (run 3), both with signature-verified webhooks.
