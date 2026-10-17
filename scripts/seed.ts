// Deterministic local seed: fixed IDs + upserts, so re-running changes nothing.
// Usage: npm run seed   (targets DATABASE_URL from .env.local)
import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { createScenario, scenarioLinks, type ScenarioIds } from "@/server/demo";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SEED: ScenarioIds = {
  payer: id(1), luca: id(11), giulia: id(12), lucaPayee: id(21), giuliaPayee: id(22), farmacia: id(23), ferri: id(24),
  history: [id(31), id(32), id(33)],
};

async function main() {
  await createScenario(db(), SEED);
  const counts = await db().execute<{ t: string; n: number }>(sql`
    select 'payer' t, count(*)::int n from payer where id = ${SEED.payer} union all
    select 'trusted_contact', count(*)::int from trusted_contact where payer_id = ${SEED.payer} union all
    select 'payee', count(*)::int from payee where payer_id = ${SEED.payer}`);
  console.log("Seeded:", Object.fromEntries(counts.rows.map((r) => [r.t, r.n])));
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  console.log("Demo-only sign-in links (24 h):", scenarioLinks(SEED, base));
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
