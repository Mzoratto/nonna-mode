import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { PayerBar } from "@/app/ui";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { payment } from "@/server/db/schema";
import { onBuyerApproved } from "@/server/decision/service";

export const dynamic = "force-dynamic";

// PayPal sends the buyer back here with ?token=<order id>. We ask PayPal (never trust the redirect)
// and then show the payment, which says "Checking with PayPal…" until authorization is confirmed.
export default async function PayPalReturn({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const actor = await requireActor("PAYER");
  const { token } = await searchParams;
  const [p] = token ? await db().select().from(payment).where(eq(payment.paypalOrderId, token)) : [];
  if (!p || p.payerId !== actor.id) {
    return (
      <div className="shell">
        <PayerBar />
        <main className="content">
          <p className="alert" role="alert">We couldn&apos;t match this PayPal approval to one of your payments.</p>
        </main>
      </div>
    );
  }
  try {
    await onBuyerApproved(p.id);
  } catch (err) {
    // Unknown outcome: the webhook and the recovery scan will finish it. The page shows the real state.
    console.error("[paypal-return] authorization pending", p.id, err);
  }
  redirect(`/payments/${p.id}`);
}
