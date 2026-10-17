import { notFound } from "next/navigation";
import { History } from "@/app/history";
import { PayerBar } from "@/app/ui";
import { requireActor } from "@/server/auth/session";
import { paymentDetail } from "@/server/views";
import { historyLines } from "@/shared/audit-text";
import { formatEur } from "@/shared/format";

export const dynamic = "force-dynamic";

export default async function PaymentHistory({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor("PAYER");
  const { id } = await params;
  const d = await paymentDetail(id).catch(() => null);
  if (!d || d.p.payerId !== actor.id) notFound();
  const names = new Map(d.contacts.map((c) => [c.id, c.name]));
  const contactName = (cid?: string | null) => (cid && names.get(cid)) || "A trusted contact";
  const lines = historyLines(d.audit, {
    payerLabel: "You", payee: d.payee.displayName, amount: formatEur(d.p.amountMinor), aiEvidence: d.p.aiEvidence, contactName,
  });
  return (
    <div className="shell">
      <PayerBar back={`/payments/${id}`} />
      <main className="content">
        <h1>What happened</h1>
        <p>{formatEur(d.p.amountMinor)} to {d.payee.displayName}</p>
        <History lines={lines} tz={d.payer.timezone} payerLabel="You" payerName={d.payer.name} contactName={contactName}
          contactNames={d.contacts.filter((c) => c.active).map((c) => c.name)} />
      </main>
    </div>
  );
}
