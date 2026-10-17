import { z } from "zod";
import { reconcile } from "@/server/decision/service";
import { recordProviderEvent } from "@/server/decision/webhooks";
import { db } from "@/server/db/client";
import { verifyWebhookSignature } from "@/server/paypal/client";

const event = z.object({
  id: z.string(),
  event_type: z.string(),
  create_time: z.string().optional(),
  resource: z.object({ id: z.string().optional(), status: z.string().optional() }).loose().optional(),
});

// Verify → record once (dedup by event ID) → reconcile by READING PayPal, never by trusting
// the event body (events arrive late and out of order; 2026-10-16 proof).
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const parsed = event.safeParse(body);
  if (!parsed.success) return new Response("bad event", { status: 400 });

  const verified = await verifyWebhookSignature(request.headers, body);
  const e = parsed.data;
  const entry = {
    event_id: e.id,
    event_type: e.event_type,
    event_create_time: e.create_time,
    resource_id: e.resource?.id,
    resource_status: e.resource?.status,
    transmission_id: request.headers.get("paypal-transmission-id"),
    verified,
  };
  console.log("[paypal-webhook]", JSON.stringify(entry));
  if (!verified) return new Response(null, { status: 400 });

  const r = await recordProviderEvent(db(), { eventId: e.id, eventType: e.event_type, resourceId: e.resource?.id ?? null });
  console.log("[paypal-webhook] recorded", JSON.stringify({ event_id: e.id, ...r }));
  if (!r.duplicate && r.paymentId) {
    try {
      const p = await reconcile(r.paymentId);
      console.log("[paypal-webhook] reconciled", JSON.stringify({ payment_id: p.id, state: p.state }));
    } catch (err) {
      // Recorded already; the recovery scan retries. Don't make PayPal redeliver.
      console.error("[paypal-webhook] reconcile failed", r.paymentId, err);
    }
  }
  return new Response(null, { status: 200 });
}
