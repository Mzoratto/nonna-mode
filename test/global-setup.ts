import net from "node:net";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { strictTls } from "../src/server/db/tls";

// Apply migrations to the test branch once per run. DB tests skip without DATABASE_URL_TEST.
export default async function setup() {
  net.setDefaultAutoSelectFamilyAttemptTimeout(2_000); // same as src/server/db/client.ts
  try {
    process.loadEnvFile(".env.local");
  } catch {}
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    console.warn("DATABASE_URL_TEST not set: database tests will be skipped");
    return;
  }
  const pool = new Pool({ connectionString: strictTls(url), max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  } finally {
    await pool.end();
  }
}
