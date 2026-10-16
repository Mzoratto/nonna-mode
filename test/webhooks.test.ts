import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { payment, webhookEvent } from "@/server/db/schema";
import { recordProviderEvent } from "@/server/decision/webhooks";
import { hasTestDb, makePayment, resetDb } from "./db";

describe.skipIf(!hasTestDb)("required test 3: duplicate webhook delivery (Neon test branch)", () => {
  beforeEach(resetDb);

  it("is processed once, with no second state change", async () => {
    const p = await makePayment({ state: "AWAITING_BUYER", paypalOrderId: "ORDER-TEST-1" });
    const event = { eventId: "WH-TEST-1", eventType: "CHECKOUT.ORDER.APPROVED", resourceId: "ORDER-TEST-1" };

    const first = await recordProviderEvent(db(), event);
    const second = await recordProviderEvent(db(), event);

    expect(first).toEqual({ duplicate: false, paymentId: p.id });
    expect(second).toEqual({ duplicate: true, paymentId: null });
    expect(await db().select().from(webhookEvent)).toHaveLength(1);
    const [after] = await db().select().from(payment).where(eq(payment.id, p.id));
    expect(after!.version).toBe(p.version);
    expect(after!.state).toBe("AWAITING_BUYER");
  });

  it("concurrent duplicate deliveries also record exactly once", async () => {
    await makePayment({ paypalOrderId: "ORDER-TEST-2" });
    const event = { eventId: "WH-TEST-2", eventType: "PAYMENT.AUTHORIZATION.CREATED", resourceId: "ORDER-TEST-2" };
    const results = await Promise.all([1, 2, 3].map(() => recordProviderEvent(db(), event)));
    expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
    expect(await db().select().from(webhookEvent)).toHaveLength(1);
  });

  it("keeps events for unknown resources without linking them", async () => {
    const r = await recordProviderEvent(db(), { eventId: "WH-TEST-3", eventType: "X", resourceId: "UNKNOWN" });
    expect(r).toEqual({ duplicate: false, paymentId: null });
  });
});
