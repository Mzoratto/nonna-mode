import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";

export const dynamic = "force-dynamic";

// Liveness + database round-trip. Also usable as Render's health check path.
export async function GET() {
  try {
    const r = await db().execute<{ db: string }>(sql`select current_database() as db`);
    return Response.json({ ok: true, db: r.rows[0]?.db ?? null });
  } catch (err) {
    console.error("[health] database check failed", err);
    return Response.json({ ok: false, db: "unreachable" }, { status: 503 });
  }
}
