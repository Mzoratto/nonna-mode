import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { z } from "zod";

// node-postgres + one shared Pool: the app is a long-lived Node server on Render
// (Neon guidance). DATABASE_URL is the pooled (-pooler) URL; migrations use
// DATABASE_URL_UNPOOLED via drizzle.config.ts.
const g = globalThis as unknown as { nonnaDb?: { pool: Pool; db: NodePgDatabase } };

export function db(): NodePgDatabase {
  if (!g.nonnaDb) {
    const pool = new Pool({ connectionString: strictTls(z.url().parse(process.env.DATABASE_URL)), max: 5 });
    g.nonnaDb = { pool, db: drizzle(pool) };
  }
  return g.nonnaDb.db;
}

/** Pin full certificate verification; pg v9 will weaken `sslmode=require` to libpq semantics. */
export function strictTls(url: string): string {
  const u = new URL(url);
  u.searchParams.set("sslmode", "verify-full");
  return u.toString();
}
