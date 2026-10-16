# Nonna Mode

PayPal **sandbox** app that holds suspicious sends as authorizations until the
payer and one eligible trusted contact approve. Hackathon deadline 2026-11-12.

**The parent `~/Downloads/CLAUDE.md` (Czech crypto SaaS) does not apply here.**
Ignore its stack, money (decimal.js) and tax rules.

Read first: `README.md`, `context/architecture-context.md` (states, tables,
policy), `context/code-standards.md`, `context/ai-workflow-rules.md`.
Progress lives in `context/progress-tracker.md`; build plan in phases 0–4.

## Commands

- `npm run dev` · `npm run typecheck` · `npm run lint` · `npm test` · `npm run build`
- `npm run proof -- <capture|void> --payee=email|merchant_id|none` — phase-0 sandbox proof (needs `.env.local`)
- Gate before merge: typecheck → lint → test → build.

## Rules that bite

- Money = integer minor units + currency (EUR only). No floats.
- Only the Decision Service (`src/server/decision/`) calls PayPal capture/void.
- AI can only **add** a hold reason. Never remove, approve, decline, capture, void.
- Payment row before any PayPal call; CAS transitions; append-only audit.
- Never claim a PayPal outcome without observed evidence; label mocked vs sandbox.
- Sandbox only. Secrets stay in `.env.local`; never in git, logs, or screenshots.
- Work on a branch per phase; don't commit to `main` directly.
