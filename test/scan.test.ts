import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { payee, payer, payment, trustedContact } from "@/server/db/schema";
import { runScan } from "@/server/decision/scan";
import { confirmByPayer, decide, onBuyerApproved, setDeps, submitSend } from "@/server/decision/service";
import { setClock } from "@/server/time";
import { hasTestDb, resetDb } from "./db";
import { fakePayPal } from "./fake-paypal";

let pp: ReturnType<typeof fakePayPal>;
let ids: { payer: string; luca: string; giulia: string; payee: string };

const H = 3_600_000;
const get = async (id: string) => (await db().select().from(payment).where(eq(payment.id, id)))[0]!;

async function held() {
  const { paymentId } = await submitSend({ payerId: ids.payer, payeeId: ids.payee, amountMinor: 30000, payerUnsure: false });
  pp.buyerApproves((await get(paymentId)).paypalOrderId!);
  return onBuyerApproved(paymentId);
}

describe.skipIf(!hasTestDb)("recovery scan (Neon test branch, fake PayPal)", () => {
  beforeEach(async () => {
    await resetDb();
    pp = fakePayPal();
    setDeps({ paypal: pp.port, scamCheck: async () => ({ status: "NO_MATCH" }) });
    const [p] = await db().insert(payer).values({ name: "Nonna Rosa", email: "rosa@example.com" }).returning();
    const [l] = await db().insert(trustedContact).values({ payerId: p!.id, name: "Luca", emailNormalized: "luca@example.com", priority: 1 }).returning();
    const [g] = await db().insert(trustedContact).values({ payerId: p!.id, name: "Giulia", emailNormalized: "giulia@example.com", priority: 2 }).returning();
    const [q] = await db().insert(payee).values({ payerId: p!.id, displayName: "Avv. Ferri", emailNormalized: "ferri@example.com" }).returning();
    ids = { payer: p!.id, luca: l!.id, giulia: g!.id, payee: q!.id };
  });
  afterEach(() => setClock(() => new Date()));

  it("escalates at 12 h, expires and voids at 24 h; a repeated scan changes nothing", async () => {
    const p = await held();
    const t0 = p.reviewOpenedAt!.getTime();

    await runScan(new Date(t0 + 11 * H));
    expect((await get(p.id)).state).toBe("PENDING_REVIEW");

    await runScan(new Date(t0 + 12 * H + 1));
    expect((await get(p.id)).state).toBe("ESCALATED");

    setClock(() => new Date(t0 + 24 * H + 1));
    await runScan(new Date(t0 + 24 * H + 1));
    const after = await get(p.id);
    expect(after.state).toBe("VOIDED");
    expect(pp.calls).toMatchObject({ captureAuthorization: 0, voidAuthorization: 1 });

    const again = await runScan(new Date(t0 + 25 * H));
    expect((await get(p.id)).version).toBe(after.version);
    expect(Object.values(again).every((s) => s.ok === 0 && s.failed === 0)).toBe(true);
    expect(pp.calls.voidAuthorization).toBe(1);
  });

  it("silence never releases money: nothing is captured however late the scan runs", async () => {
    const p = await held();
    await confirmByPayer(ids.payer, p.id); // payer said yes, but no contact answered
    await runScan(new Date(p.reviewOpenedAt!.getTime() + 100 * H));
    expect((await get(p.id)).state).toBe("VOIDED");
    expect(pp.calls.captureAuthorization).toBe(0);
  });

  it("recovers a capture whose response was lost, with the stored request ID", async () => {
    const p = await held();
    await confirmByPayer(ids.payer, p.id);
    pp.loseNextCaptureResponse();
    await expect(decide(ids.luca, p.id, "APPROVE")).rejects.toThrow();
    const stuck = await get(p.id);
    expect(stuck.pendingOperation).toBe("CAPTURE");

    await runScan(new Date(Date.now() + 60_000)); // within the 2-minute grace: left alone
    expect((await get(p.id)).state).toBe("APPROVED");

    await runScan(new Date(Date.now() + 3 * 60_000));
    expect((await get(p.id)).state).toBe("CAPTURED");
    expect(pp.requestIds.filter((r) => r === stuck.captureRequestId)).toHaveLength(2);
  });

  it("abandons a buyer approval that never happened (no money held)", async () => {
    const { paymentId } = await submitSend({ payerId: ids.payer, payeeId: ids.payee, amountMinor: 1000, payerUnsure: false });
    const created = (await get(paymentId)).createdAt.getTime();
    await runScan(new Date(created + 2 * H));
    expect((await get(paymentId)).state).toBe("AWAITING_BUYER");
    await runScan(new Date(created + 3 * H + 1));
    expect((await get(paymentId)).state).toBe("ABANDONED");
    expect(pp.calls.authorizeOrder).toBe(0);
  });
});
