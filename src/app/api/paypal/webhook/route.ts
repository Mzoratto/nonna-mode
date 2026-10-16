import { z } from "zod";
import { appendEvidence } from "@/server/evidence";
import { verifyWebhookSignature } from "@/server/paypal/client";

const event = z.object({
  id: z.string(),
  event_type: z.string(),
  create_time: z.string().optional(),
  resource: z.object({ id: z.string().optional(), status: z.string().optional() }).loose().optional(),
});

// Phase 0: verify the signature and record what actually arrives. No state changes yet.
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
  // Hosted (Render) disks are ephemeral; the log line is the readable record there.
  console.log("[paypal-webhook]", JSON.stringify(entry));
  await appendEvidence("webhooks", entry);
  return new Response(null, { status: verified ? 200 : 400 });
}
