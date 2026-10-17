import "server-only";
import { and, eq, inArray, isNotNull, lt, lte, or, type SQL } from "drizzle-orm";
import { db } from "@/server/db/client";
import { notification, payment } from "@/server/db/schema";
import { deliver } from "@/server/notifications/send";
import { now, POLICY_HOURS, timeScale } from "@/server/time";
import { abandon, escalate, expire, reconcile } from "./service";

// Recovery scan (architecture-context.md): runs at startup and on a schedule.
// Every step goes through the Decision Service and is idempotent, so duplicate
// or overlapping scans are harmless.
const PENDING_GRACE_MS = 2 * 60_000; // in-flight PayPal call older than this is "stuck"

export async function runScan(at: Date = now()) {
  const d = db();
  const ids = async (where: SQL | undefined) =>
    (await d.select({ id: payment.id }).from(payment).where(where)).map((r) => r.id);

  const abandonBefore = new Date(at.getTime() - (POLICY_HOURS.abandonBuyer * 3_600_000) / timeScale());
  const steps = {
    abandoned: await ids(and(eq(payment.state, "AWAITING_BUYER"), lt(payment.createdAt, abandonBefore))),
    recovered: await ids(
      or(
        and(isNotNull(payment.pendingOperation), lt(payment.pendingOperationAt, new Date(at.getTime() - PENDING_GRACE_MS))),
        inArray(payment.state, ["DECLINED", "EXPIRED"]), // void not yet confirmed
      ),
    ),
    escalated: await ids(and(eq(payment.state, "PENDING_REVIEW"), lte(payment.escalationAt, at))),
    expired: await ids(and(inArray(payment.state, ["PENDING_REVIEW", "ESCALATED"]), lte(payment.expiresAt, at))),
  };

  const run = { abandoned: abandon, recovered: reconcile, escalated: escalate, expired: expire } as const;
  const result: Record<string, { ok: number; failed: number }> = {};
  for (const [step, list] of Object.entries(steps) as [keyof typeof steps, string[]][]) {
    result[step] = { ok: 0, failed: 0 };
    for (const id of list) {
      try {
        await (step === "recovered" ? reconcile(id) : run[step](id, at));
        result[step].ok++;
      } catch (err) {
        result[step].failed++; // left for the next scan
        console.error(`[scan] ${step} failed`, id, err);
      }
    }
  }
  // Email notices whose delivery failed transiently (still PENDING after the grace period).
  const stale = await d
    .select({ id: notification.id })
    .from(notification)
    .where(and(eq(notification.status, "PENDING"), lt(notification.createdAt, new Date(at.getTime() - PENDING_GRACE_MS))));
  result.emails = { ok: 0, failed: 0 };
  for (const { id } of stale) result.emails[(await deliver(id)) === "PENDING" ? "failed" : "ok"]++;
  return result;
}
