import { eq, or } from "drizzle-orm";
import { payment, webhookEvent } from "@/server/db/schema";
import { now } from "@/server/time";
import type { Db, Tx } from "./transitions";

export type ProviderEvent = { eventId: string; eventType: string; resourceId: string | null };

/**
 * Record a verified PayPal event exactly once (unique paypal_event_id) and link
 * it to its Payment. Webhooks arrive late and out of order (2026-10-16 proof),
 * so they never set state directly: phase 2 reconciles by reading the resource.
 */
export async function recordProviderEvent(ex: Db | Tx, e: ProviderEvent) {
  return ex.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(webhookEvent)
      .values({ paypalEventId: e.eventId, eventType: e.eventType, resourceId: e.resourceId })
      .onConflictDoNothing()
      .returning({ id: webhookEvent.paypalEventId });
    if (!inserted) return { duplicate: true as const, paymentId: null };

    const r = e.resourceId;
    const [linked] = r
      ? await tx
          .select({ id: payment.id })
          .from(payment)
          .where(or(eq(payment.paypalOrderId, r), eq(payment.paypalAuthorizationId, r), eq(payment.paypalCaptureId, r)))
          .limit(1)
      : [];
    await tx
      .update(webhookEvent)
      .set({ paymentId: linked?.id ?? null, processedAt: now() })
      .where(eq(webhookEvent.paypalEventId, e.eventId));
    return { duplicate: false as const, paymentId: linked?.id ?? null };
  });
}
