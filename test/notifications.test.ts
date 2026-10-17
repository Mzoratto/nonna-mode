import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { notification, payee, payer, payment, trustedContact } from "@/server/db/schema";
import { deliver } from "@/server/notifications/send";
import { hasTestDb, resetDb } from "./db";

let calls: { headers: Headers; body: Record<string, unknown> }[];
const resend = (status: number) =>
  (async (_u: string, init: RequestInit) => {
    calls.push({ headers: new Headers(init.headers), body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ id: "email_1" }), { status });
  }) as unknown as typeof fetch;

async function notice(contactEmail: string) {
  const [p] = await db().insert(payer).values({ name: "Rosa", email: "rosa@example.com" }).returning();
  const [c] = await db().insert(trustedContact).values({ payerId: p!.id, name: "Luca Bianchi", emailNormalized: contactEmail, priority: 1 }).returning();
  const [q] = await db().insert(payee).values({ payerId: p!.id, displayName: "Avv. Ferri" }).returning();
  const [pay] = await db().insert(payment).values({ payerId: p!.id, payeeId: q!.id, amountMinor: 200000, flagged: true, flaggedReasons: ["NEW_PAYEE"], state: "PENDING_REVIEW", note: "SECRET NOTE", pastedMessage: "SECRET MESSAGE" }).returning();
  const [n] = await db().insert(notification).values({ paymentId: pay!.id, recipientType: "CONTACT", recipientId: c!.id, type: "REVIEW_REQUEST", idempotencyKey: `REVIEW_REQUEST:${pay!.id}:${c!.id}` }).returning();
  return n!;
}
const status = async (id: string) => (await db().select().from(notification).where(eq(notification.id, id)))[0]!.status;

describe.skipIf(!hasTestDb)("email delivery via Resend (Neon test branch, fake Resend)", () => {
  beforeEach(async () => {
    await resetDb();
    calls = [];
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "Nonna Mode <notices@nonna.test-domain.it>";
  });
  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    delete process.env.DEMO_EMAIL_OVERRIDE;
  });

  it("sends once, with the notice's idempotency key, a sign-in link, and no note or message content", async () => {
    const n = await notice("luca@real-family.it");
    expect(await deliver(n.id, { fetch: resend(200) })).toBe("SENT");
    expect(await deliver(n.id, { fetch: resend(200) })).toBe("SENT"); // already sent: no second email
    expect(calls).toHaveLength(1);
    expect(calls[0]!.headers.get("Idempotency-Key")).toBe(n.idempotencyKey);
    const text = String(calls[0]!.body.text);
    expect(calls[0]!.body.to).toEqual(["luca@real-family.it"]);
    expect(text).toMatch(/\/auth\/[\w-]+\.[\w-]+/);
    expect(text).toContain("not from PayPal");
    expect(text).not.toMatch(/SECRET/);
    expect(await status(n.id)).toBe("SENT");
  });

  it("skips reserved demo addresses (they appear in the in-app outbox instead)", async () => {
    const n = await notice("luca@example.com");
    expect(await deliver(n.id, { fetch: resend(200) })).toBe("SKIPPED");
    expect(calls).toHaveLength(0);
  });

  it("DEMO_EMAIL_OVERRIDE routes demo notices to one real inbox", async () => {
    process.env.DEMO_EMAIL_OVERRIDE = "marco@real-inbox.it";
    const n = await notice("luca@example.com");
    expect(await deliver(n.id, { fetch: resend(200) })).toBe("SENT");
    expect(calls[0]!.body.to).toEqual(["marco@real-inbox.it"]);
  });

  it("a 4xx refusal is final; a 5xx stays pending for the scan to retry", async () => {
    const a = await notice("luca@real-family.it");
    expect(await deliver(a.id, { fetch: resend(422) })).toBe("FAILED");
    await resetDb();
    const b = await notice("luca@real-family.it");
    expect(await deliver(b.id, { fetch: resend(503) })).toBe("PENDING");
    expect(await status(b.id)).toBe("PENDING");
  });

  it("without Resend configured, notices are skipped, not failed", async () => {
    delete process.env.RESEND_API_KEY;
    const n = await notice("luca@real-family.it");
    expect(await deliver(n.id, { fetch: resend(200) })).toBe("SKIPPED");
  });
});
