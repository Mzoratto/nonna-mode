import Link from "next/link";
import { notFound } from "next/navigation";
import { Shield } from "@/app/icons";
import { verifyToken } from "@/server/auth/links";
import { renderNotice } from "@/server/notifications/templates";
import { contactsOf, outbox, payerHome } from "@/server/views";
import { formatWhen } from "@/shared/format";

export const dynamic = "force-dynamic";

// Judges don't own the demo's email addresses, so every notice is also shown here.
export default async function Outbox({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  const { k } = await searchParams;
  const scenario = k ? verifyToken(k) : null;
  if (scenario?.t !== "ADMIN") notFound();
  const [{ payer }, contacts, rows] = await Promise.all([payerHome(scenario.id), contactsOf(scenario.id), outbox(scenario.id)]);
  if (!payer) notFound();
  const nameOf = (type: string, id: string) => (type === "PAYER" ? payer.name : contacts.find((c) => c.id === id)?.name ?? "Contact");
  return (
    <div className="shell">
      <header className="bar"><Link className="brand" href={`/demo?k=${k}`}><Shield size={30} /> Nonna Mode</Link><span className="spacer" /><span className="pill pill-gray">Demo outbox</span></header>
      <main className="content">
        <h1>Notices</h1>
        <p className="muted">What Nonna Mode would email to each person. Sent from Nonna Mode, never from PayPal. No message contents are included.</p>
        {rows.length === 0 && <p className="card card-dashed">No notices yet.</p>}
        {rows.map(({ n, p, payeeName }) => {
          const to = nameOf(n.recipientType, n.recipientId);
          const msg = renderNotice(n, { amountMinor: p.amountMinor, payeeName, recipientName: to, payerName: payer.name, explanation: p.explanationText });
          return (
            <article key={n.id} className="card">
              <p className="muted small" style={{ margin: 0 }}>To <strong>{to}</strong> · {formatWhen(n.createdAt, payer.timezone)} · {n.status.toLowerCase()}</p>
              <p style={{ fontWeight: 800, margin: "6px 0 4px" }}>{msg.subject}</p>
              <p style={{ margin: 0 }}>{msg.body}</p>
            </article>
          );
        })}
      </main>
    </div>
  );
}
