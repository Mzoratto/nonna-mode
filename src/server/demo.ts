import "server-only";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { signToken } from "@/server/auth/links";
import { auditEvent, payee, payer, payment, trustedContact } from "@/server/db/schema";
import type { Db, Tx } from "@/server/decision/transitions";

export type ScenarioIds = {
  payer: string;
  luca: string; // son: contact priority 1, AND a payee → self-dealing scene
  giulia: string; // daughter: contact priority 2, also a payee
  lucaPayee: string;
  giuliaPayee: string;
  farmacia: string;
  ferri: string; // the only NEW payee: the "grandson in jail" bail scene
  history: [string, string, string]; // seeded past payments to Luca, Giulia, Farmacia
};

export const freshIds = (): ScenarioIds => ({
  payer: randomUUID(), luca: randomUUID(), giulia: randomUUID(), lucaPayee: randomUUID(), giuliaPayee: randomUUID(),
  farmacia: randomUUID(), ferri: randomUUID(), history: [randomUUID(), randomUUID(), randomUUID()],
});

/** The demo cast (matches the design comps). Upserts on fixed IDs, so the local seed is re-runnable. */
export async function createScenario(ex: Db | Tx, ids: ScenarioIds) {
  await ex.transaction(async (tx) => {
    await tx
      .insert(payer)
      .values({ id: ids.payer, name: "Rosa", email: "rosa@example.com", thresholdMinor: 20000, timezone: "Europe/Rome" })
      .onConflictDoUpdate({ target: payer.id, set: { name: "Rosa" } });
    // Demo phone numbers use the reserved fictional range; the buttons are tel: links.
    for (const c of [
      { id: ids.luca, name: "Luca Bianchi", emailNormalized: "luca@example.com", phone: "+39 02 0000 0001", priority: 1 },
      { id: ids.giulia, name: "Giulia Bianchi", emailNormalized: "giulia@example.com", phone: "+39 02 0000 0002", priority: 2 },
    ]) {
      await tx
        .insert(trustedContact)
        .values({ ...c, payerId: ids.payer })
        .onConflictDoUpdate({ target: trustedContact.id, set: { name: c.name, emailNormalized: c.emailNormalized, phone: c.phone, active: true } });
    }
    const payees = [
      { id: ids.giuliaPayee, displayName: "Giulia Bianchi", relationship: "Your daughter", emailNormalized: "giulia@example.com" },
      { id: ids.lucaPayee, displayName: "Luca Bianchi", relationship: "Your son", emailNormalized: "luca@example.com" },
      { id: ids.farmacia, displayName: "Farmacia Moretti", relationship: "Your pharmacy", emailNormalized: "farmacia.moretti@example.com" },
      { id: ids.ferri, displayName: "Avv. Ferri", relationship: "Lawyer", emailNormalized: "ferri.avvocato@example.com" },
    ];
    for (const p of payees) {
      await tx
        .insert(payee)
        .values({ ...p, payerId: ids.payer })
        .onConflictDoUpdate({ target: payee.id, set: { displayName: p.displayName, relationship: p.relationship, emailNormalized: p.emailNormalized } });
    }
    // Past payments make these payees "known". Seed data, labelled as such; not PayPal captures.
    const history: [string, string, number, string][] = [
      [ids.history[0], ids.lucaPayee, 5000, "Birthday present"],
      [ids.history[1], ids.giuliaPayee, 8000, "Train tickets"],
      [ids.history[2], ids.farmacia, 4500, "Monthly prescriptions"],
    ];
    for (const [id, payeeId, amountMinor, note] of history) {
      await tx
        .insert(payment)
        .values({ id, payerId: ids.payer, payeeId, amountMinor, note, flagged: false, state: "CAPTURED", isSeed: true, createdAt: sql`now() - interval '30 days'` })
        .onConflictDoNothing();
      const [seeded] = await tx.select({ id: auditEvent.id }).from(auditEvent).where(eq(auditEvent.paymentId, id)).limit(1);
      if (!seeded) {
        await tx.insert(auditEvent).values({ paymentId: id, actorType: "SYSTEM", action: "SEED_HISTORY", newState: "CAPTURED", details: { seed: true } });
      }
    }
  });
}

/** Demo-only sign-in links for each actor (labelled demo-only in the UI). */
export function scenarioLinks(ids: Pick<ScenarioIds, "payer" | "luca" | "giulia">, baseUrl: string, ttlSeconds = 24 * 3600) {
  const link = (t: "PAYER" | "CONTACT" | "ADMIN", id: string) => `${baseUrl}/auth/${signToken({ t, id }, ttlSeconds)}`;
  return {
    payer: link("PAYER", ids.payer),
    luca: link("CONTACT", ids.luca),
    giulia: link("CONTACT", ids.giulia),
    admin: link("ADMIN", ids.payer), // admin scope = this payer's setup
  };
}
