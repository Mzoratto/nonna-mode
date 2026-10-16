// Phase-0 sandbox money-flow proof. Manual evidence, not a test.
// Usage: npm run proof -- <capture|void> --payee=email|merchant_id|none
import { randomUUID } from "node:crypto";
import { env } from "@/env";
import { appendEvidence } from "@/server/evidence";
import {
  authorizeOrder,
  captureAuthorization,
  createOrder,
  getAuthorization,
  getOrder,
  PayPalError,
  type Payee,
  voidAuthorization,
} from "@/server/paypal/client";

const AMOUNT_MINOR = 1000; // €10.00
const POLL_MS = 3_000;
const POLL_LIMIT_MS = 10 * 60_000;

const mode = process.argv[2];
const payeeMode = process.argv.find((a) => a.startsWith("--payee="))?.slice("--payee=".length) ?? "email";
if ((mode !== "capture" && mode !== "void") || !["email", "merchant_id", "none"].includes(payeeMode)) {
  console.error("Usage: npm run proof -- <capture|void> --payee=email|merchant_id|none");
  process.exit(2);
}

function payee(): Payee | undefined {
  if (payeeMode === "none") return undefined;
  const v = payeeMode === "email" ? process.env.PROOF_PAYEE_EMAIL : process.env.PROOF_PAYEE_MERCHANT_ID;
  if (!v) throw new Error(`set PROOF_PAYEE_${payeeMode === "email" ? "EMAIL" : "MERCHANT_ID"} in .env.local`);
  return payeeMode === "email" ? { email_address: v } : { merchant_id: v };
}

const run = randomUUID();
async function log(step: string, data: Record<string, unknown>) {
  console.log(`[${step}]`, data);
  await appendEvidence("proof", { run, mode, payee_mode: payeeMode, step, ...data });
}

// Replays probe PayPal-Request-Id behavior; an error here is evidence, not a reason to stop.
async function replay(step: string, fn: () => Promise<Record<string, unknown>>) {
  try {
    await log(step, await fn());
  } catch (err) {
    await log(step, err instanceof PayPalError ? { error: err.errorName, status: err.status, debug_id: err.debugId } : { error: String(err) });
  }
}

async function main() {
  const { APP_BASE_URL } = env();
  const rid = { order: randomUUID(), authorize: randomUUID(), op: randomUUID() };

  const order = await createOrder({
    amountMinor: AMOUNT_MINOR,
    payee: payee(),
    customId: `proof-${run}`,
    returnUrl: `${APP_BASE_URL}/paypal/return`,
    cancelUrl: `${APP_BASE_URL}/`,
    requestId: rid.order,
  });
  await log("order.created", { order_id: order.id, status: order.status });
  if (!order.approveUrl) throw new Error("no approval link in order response");
  console.log(`\nApprove as the sandbox BUYER:\n  ${order.approveUrl}\n`);

  const deadline = Date.now() + POLL_LIMIT_MS;
  for (;;) {
    const o = await getOrder(order.id);
    if (o.status === "APPROVED") break;
    if (o.status !== "CREATED" && o.status !== "PAYER_ACTION_REQUIRED") throw new Error(`order status ${o.status}`);
    if (Date.now() > deadline) throw new Error("buyer did not approve within 10 minutes");
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  const approvedAt = Date.now();
  await log("order.approved", { order_id: order.id });

  const auth = await authorizeOrder(order.id, rid.authorize);
  if (!auth.authorization) throw new Error("authorize response has no authorization");
  await log("authorization.created", { ...auth.authorization, order_status: auth.orderStatus, ms_after_approval: Date.now() - approvedAt });

  // Same request ID again: expect the same authorization, not a second one.
  const firstAuthId = auth.authorization.id;
  await replay("authorization.replay", async () => {
    const r = await authorizeOrder(order.id, rid.authorize);
    return { id: r.authorization?.id, same_id: r.authorization?.id === firstAuthId };
  });

  const authId = auth.authorization.id;
  await log("authorization.get", await getAuthorization(authId));

  if (mode === "capture") {
    const c1 = await captureAuthorization(authId, rid.op);
    await log("capture", c1);
    await replay("capture.replay", async () => {
      const c2 = await captureAuthorization(authId, rid.op);
      return { ...c2, same_id: c1.id === c2.id };
    });
  } else {
    await log("void", { body: await voidAuthorization(authId, rid.op) });
    await replay("void.replay", async () => ({ body: await voidAuthorization(authId, rid.op) }));
  }

  const final = await getAuthorization(authId);
  await log("authorization.final", final);
  const expected = mode === "capture" ? "CAPTURED" : "VOIDED";
  console.log(final.status === expected ? `\nOK: authorization ${final.status}` : `\nUNEXPECTED: ${final.status} (wanted ${expected})`);
  console.log("Now check evidence/raw/webhooks.jsonl for the matching events.");
}

main().catch(async (err: unknown) => {
  if (err instanceof PayPalError) {
    await log("error", { status: err.status, name: err.errorName, debug_id: err.debugId, details: err.details });
  } else {
    // A timeout lands here: the operation result is UNKNOWN — check the resource before retrying.
    await log("error", { message: err instanceof Error ? err.message : String(err) });
  }
  process.exit(1);
});
