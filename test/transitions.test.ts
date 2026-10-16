import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { auditEvent, decision, payment } from "@/server/db/schema";
import { Conflict, transition } from "@/server/decision/transitions";
import { hasTestDb, makePayment, resetDb } from "./db";

describe.skipIf(!hasTestDb)("compare-and-set transitions (Neon test branch)", () => {
  beforeEach(resetDb);

  it("approve and expire racing on the same payment: exactly one wins", async () => {
    const p = await makePayment({ state: "PENDING_REVIEW" });
    const approve = transition(db(), {
      paymentId: p.id, from: "PENDING_REVIEW", version: p.version, to: "APPROVED",
      actor: { type: "CONTACT", id: crypto.randomUUID() }, action: "CONTACT_APPROVED",
      decision: { type: "APPROVE", idempotencyKey: `approve:${p.id}` },
    });
    const expire = transition(db(), {
      paymentId: p.id, from: "PENDING_REVIEW", version: p.version, to: "EXPIRED",
      actor: { type: "SYSTEM" }, action: "REVIEW_EXPIRED",
    });
    const results = await Promise.allSettled([approve, expire]);

    // Self-describing on failure: which side won, and what the loser threw.
    const outcome = results.map((r) =>
      r.status === "fulfilled" ? `won:${r.value.state}` : r.reason instanceof Conflict ? "conflict" : `error:${String(r.reason?.cause ?? r.reason)}`,
    );
    expect(outcome.filter((o) => o === "conflict"), outcome.join(" | ")).toHaveLength(1);
    expect(outcome.filter((o) => /^won:(APPROVED|EXPIRED)$/.test(o)), outcome.join(" | ")).toHaveLength(1);

    const [after] = await db().select().from(payment).where(eq(payment.id, p.id));
    expect(after!.version).toBe(p.version + 1);
    const audits = await db().select().from(auditEvent).where(eq(auditEvent.paymentId, p.id));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.newState).toBe(after!.state);
    // The losing side left nothing behind: a decision exists only if approve won.
    const decisions = await db().select().from(decision).where(eq(decision.paymentId, p.id));
    expect(decisions).toHaveLength(after!.state === "APPROVED" ? 1 : 0);
  });

  it("rejects transitions the state machine does not allow", async () => {
    const p = await makePayment({ state: "DECLINED" });
    await expect(
      transition(db(), { paymentId: p.id, from: "DECLINED", version: p.version, to: "CAPTURED", actor: { type: "SYSTEM" }, action: "X" }),
    ).rejects.toThrow(/illegal transition/);
  });

  it("a stale version is a conflict, not permission to continue", async () => {
    const p = await makePayment({ state: "PENDING_REVIEW" });
    await expect(
      transition(db(), { paymentId: p.id, from: "PENDING_REVIEW", version: p.version + 7, to: "EXPIRED", actor: { type: "SYSTEM" }, action: "X" }),
    ).rejects.toBeInstanceOf(Conflict);
  });

  it("audit_event is append-only at the database level", async () => {
    const p = await makePayment({ state: "PENDING_REVIEW" });
    await transition(db(), { paymentId: p.id, from: "PENDING_REVIEW", version: p.version, to: "EXPIRED", actor: { type: "SYSTEM" }, action: "REVIEW_EXPIRED" });
    // Drizzle wraps driver errors; the trigger's message is on `cause`.
    const blocked = { cause: { message: expect.stringMatching(/append-only/) } };
    await expect(db().execute(sql`update audit_event set action = 'TAMPERED'`)).rejects.toMatchObject(blocked);
    await expect(db().execute(sql`delete from audit_event`)).rejects.toMatchObject(blocked);
  });
});
