// UI fixtures: one demo family with a payment in every screen state, on the
// Neon TEST branch, using a fake PayPal (no sandbox calls, no money). For visual
// checks and Devpost screenshots. Refuses to run against the app database.
//
// Usage: npm run ui:fixtures -- <out.json>   (then run the app with DATABASE_URL=$DATABASE_URL_TEST)
import { writeFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { signToken } from "@/server/auth/links";
import { db } from "@/server/db/client";
import { payment } from "@/server/db/schema";
import { cancelByPayer, confirmByPayer, decide, onBuyerApproved, setDeps, submitSend } from "@/server/decision/service";
import { createScenario, freshIds, scenarioLinks } from "@/server/demo";
import { fakePayPal } from "../test/fake-paypal";

const test = process.env.DATABASE_URL_TEST;
if (!test) throw new Error("DATABASE_URL_TEST is required");
const host = (u?: string) => (u ? new URL(u).hostname.split(".")[0]?.replace("-pooler", "") : "");
if (host(test) === host(process.env.DATABASE_URL_UNPOOLED) || host(test) === host(process.env.DATABASE_URL)) {
  throw new Error("DATABASE_URL_TEST points at the app database; refusing");
}
process.env.DATABASE_URL = test; // the db() client reads this lazily

const pp = fakePayPal();
const BAIL = "Nonna it's me Matteo. I had a car accident and the police are keeping me. Please don't tell mamma. The lawyer needs €2,000 for bail today.";
setDeps({
  paypal: pp.port,
  scamCheck: async ({ text }) =>
    /bail/i.test(text)
      ? { status: "MATCH", pattern: "EMERGENCY_OR_BAIL", evidence: "The message asks for bail money today and says not to tell anyone." }
      : { status: "NO_MATCH" },
  wording: async (f) => ({
    explanation: `Your payment of €${f.amountMinor / 100} to ${f.payee} is paused. No money has been sent. A trusted contact will take a look with you.`,
    brief: f.pastedMessage
      ? `Rosa wants to send €${f.amountMinor / 100} to ${f.payee}, a ${f.payeeRelationship?.toLowerCase()}. The message claims Matteo had a car accident, is held by police, needs bail today, and asks Rosa not to tell "mamma". No money has been sent.`
      : `Rosa wants to send €${f.amountMinor / 100} to ${f.payee}. No money has been sent.`,
    source: "ai",
  }),
  deliver: async () => "SKIPPED",
});

await db().execute(sql`truncate webhook_event, notification, audit_event, decision, payment, payee, trusted_contact, payer restart identity cascade`);
const ids = freshIds();
await createScenario(db(), ids);

async function held(payeeId: string, amountMinor: number, note: string, pasted?: string) {
  const { paymentId } = await submitSend({ payerId: ids.payer, payeeId, amountMinor, note, pastedMessage: pasted, payerUnsure: false });
  const [row] = await db().select().from(payment).where(eq(payment.id, paymentId));
  pp.buyerApproves(row!.paypalOrderId!);
  return onBuyerApproved(paymentId);
}

const paused = await held(ids.ferri, 200000, "Matteo's bail", BAIL); // comp 4
const waiting = await held(ids.ferri, 50000, "Legal fees");
await confirmByPayer(ids.payer, waiting.id);
const declined = await held(ids.ferri, 200000, "bail deposit", BAIL); // comp 5 + 6
await confirmByPayer(ids.payer, declined.id);
await decide(ids.luca, declined.id, "DECLINE", "Mamma, I called Matteo. He's fine and at work. Please call me.");
const selfDeal = await held(ids.lucaPayee, 90000, "car repair"); // comps 8 + 9
await confirmByPayer(ids.payer, selfDeal.id);
await decide(ids.luca, selfDeal.id, "APPROVE");
const review = await held(ids.ferri, 200000, "bail deposit", BAIL); // comp 7
await confirmByPayer(ids.payer, review.id);
const sent = await held(ids.giuliaPayee, 30000, "Birthday dinner");
await confirmByPayer(ids.payer, sent.id);
await decide(ids.luca, sent.id, "APPROVE", "Have a lovely dinner!");
const cancelled = await held(ids.farmacia, 25000, "Prescriptions");
await cancelByPayer(ids.payer, cancelled.id);

const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
const out = {
  ...scenarioLinks(ids, base),
  pages: {
    paused: `/payments/${paused.id}`, waiting: `/payments/${waiting.id}`, notSent: `/payments/${declined.id}`,
    history: `/payments/${declined.id}/history`, sent: `/payments/${sent.id}`, cancelled: `/payments/${cancelled.id}`,
    review: `/review/${review.id}`, selfDeal: `/review/${selfDeal.id}`, decided: `/review/${declined.id}`,
  },
  demoKey: signToken({ t: "ADMIN", id: ids.payer }, 24 * 3600),
};
writeFileSync(process.argv[2] ?? "ui-fixtures.json", JSON.stringify(out, null, 2));
console.log("UI fixtures ready on the test branch:", Object.keys(out.pages).join(", "));
process.exit(0);
