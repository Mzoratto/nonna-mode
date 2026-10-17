import { notFound } from "next/navigation";
import { History } from "@/app/history";
import { ContactBar } from "@/app/ui";
import { requireActor } from "@/server/auth/session";
import { paymentDetail } from "@/server/views";
import { historyLines } from "@/shared/audit-text";
import { formatEur } from "@/shared/format";

export const dynamic = "force-dynamic";

// Contacts see the same history as the payer (comp 6 footer), worded from their side.
export default async function ContactHistory({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor("CONTACT");
  const { id } = await params;
  const d = await paymentDetail(id).catch(() => null);
  const me = d?.contacts.find((c) => c.id === actor.id);
  if (!d || !me) notFound();
  const names = new Map(d.contacts.map((c) => [c.id, c.name]));
  const contactName = (cid?: string | null) => (cid && names.get(cid)) || "A trusted contact";
  const lines = historyLines(d.audit, {
    payerLabel: d.payer.name, payee: d.payee.displayName, amount: formatEur(d.p.amountMinor), aiEvidence: d.p.aiEvidence, contactName,
  });
  return (
    <div className="shell soft">
      <ContactBar back={`/review/${id}`} title="What happened" contactName={me.name} payerName={d.payer.name} />
      <main className="content">
        <p style={{ marginTop: 16 }}>{d.payer.name} → {d.payee.displayName} · {formatEur(d.p.amountMinor)}</p>
        <History lines={lines} tz={d.payer.timezone} payerLabel={d.payer.name} payerName={d.payer.name} contactName={contactName}
          contactNames={d.contacts.filter((c) => c.active).map((c) => c.name)} />
      </main>
    </div>
  );
}
