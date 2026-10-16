// Deterministic demo seed: fixed IDs + upserts, so re-running changes nothing.
// Usage: npm run seed   (targets DATABASE_URL from .env.local)
// Seeded history is marked is_seed and never presented as a live PayPal operation.
import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { auditEvent, payee, payer, payment, trustedContact } from "@/server/db/schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const SEED = {
  payer: id(1),
  luca: id(11), // son, contact priority 1, AND a payee → self-dealing scene
  giulia: id(12), // daughter, contact priority 2
  farmacia: id(21), // known payee (seeded captured history)
  lucaPayee: id(22),
  bail: id(23), // new payee for the "grandson in jail" scam scene
  plumber: id(24), // new, ordinary payee
  history: id(31),
  historyAudit: id(41),
} as const;

async function main() {
  const d = db();
  await d.transaction(async (tx) => {
    await tx
      .insert(payer)
      .values({ id: SEED.payer, name: "Nonna Rosa", email: "rosa@example.com", thresholdMinor: 20000, timezone: "Europe/Rome" })
      .onConflictDoUpdate({ target: payer.id, set: { name: "Nonna Rosa", thresholdMinor: 20000 } });

    for (const c of [
      { id: SEED.luca, name: "Luca", emailNormalized: "luca@example.com", priority: 1 },
      { id: SEED.giulia, name: "Giulia", emailNormalized: "giulia@example.com", priority: 2 },
    ]) {
      await tx
        .insert(trustedContact)
        .values({ ...c, payerId: SEED.payer })
        .onConflictDoUpdate({ target: trustedContact.id, set: { name: c.name, emailNormalized: c.emailNormalized, priority: c.priority, active: true } });
    }

    for (const p of [
      { id: SEED.farmacia, displayName: "Farmacia Centrale", emailNormalized: "farmacia@example.com" },
      { id: SEED.lucaPayee, displayName: "Luca", emailNormalized: "luca@example.com" },
      { id: SEED.bail, displayName: "Avv. Ferri (bail payment)", emailNormalized: "ferri.bail@example.com" },
      { id: SEED.plumber, displayName: "Idraulico Bruno", emailNormalized: "bruno@example.com" },
    ]) {
      await tx
        .insert(payee)
        .values({ ...p, payerId: SEED.payer })
        .onConflictDoUpdate({ target: payee.id, set: { displayName: p.displayName, emailNormalized: p.emailNormalized } });
    }

    // Makes Farmacia a known payee (no NEW_PAYEE flag). Seed data, not a PayPal capture.
    await tx
      .insert(payment)
      .values({
        id: SEED.history,
        payerId: SEED.payer,
        payeeId: SEED.farmacia,
        amountMinor: 4500,
        note: "Monthly prescriptions",
        flagged: false,
        state: "CAPTURED",
        isSeed: true,
        createdAt: sql`now() - interval '30 days'`,
      })
      .onConflictDoNothing();
    await tx
      .insert(auditEvent)
      .values({
        id: SEED.historyAudit,
        paymentId: SEED.history,
        actorType: "SYSTEM",
        action: "SEED_HISTORY",
        newState: "CAPTURED",
        details: { seed: true, note: "Seeded history row, not a live PayPal operation" },
      })
      .onConflictDoNothing();
  });

  const counts = await d.execute<{ t: string; n: number }>(sql`
    select 'payer' t, count(*)::int n from payer union all
    select 'trusted_contact', count(*)::int from trusted_contact union all
    select 'payee', count(*)::int from payee union all
    select 'payment (seed)', count(*)::int from payment where is_seed`);
  console.log("Seeded:", Object.fromEntries(counts.rows.map((r) => [r.t, r.n])));
  console.log("Signed sign-in links arrive with auth in phase 2.");
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
