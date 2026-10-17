import "server-only";
import net from "node:net";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { z } from "zod";
import { strictTls } from "./tls";

// node-postgres + one shared Pool: the app is a long-lived Node server on Render
// (Neon guidance). DATABASE_URL is the pooled (-pooler) URL; migrations use
// DATABASE_URL_UNPOOLED via drizzle.config.ts.
// Neon's host resolves to several IPs; Node gives each connect attempt only
// 250 ms by default ("happy eyeballs"), which times out on slower networks
// (seen as ETIMEDOUT in tests, 2026-10-16). Give each address 2 s.
net.setDefaultAutoSelectFamilyAttemptTimeout(2_000);

const g = globalThis as unknown as { nonnaDb?: { pool: Pool; db: NodePgDatabase } };

export function db(): NodePgDatabase {
  if (!g.nonnaDb) {
    const pool = new Pool({ connectionString: strictTls(z.url().parse(process.env.DATABASE_URL)), max: 5 });
    g.nonnaDb = { pool, db: drizzle(pool) };
  }
  return g.nonnaDb.db;
}
