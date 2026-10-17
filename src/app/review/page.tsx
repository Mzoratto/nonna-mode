import Link from "next/link";
import { ContactBar } from "@/app/ui";
import { requireActor } from "@/server/auth/session";
import { contactInbox } from "@/server/views";
import { Check } from "@/app/icons";
import { formatEur, formatWhen } from "@/shared/format";

export const dynamic = "force-dynamic";

// Comp 9: only requests this contact may act on right now.
export default async function Inbox() {
  const actor = await requireActor("CONTACT");
  const inbox = await contactInbox(actor.id);
  if (!inbox) return <p className="alert">Contact not found.</p>;
  const { contact, payer, items } = inbox;
  const tz = payer.timezone;
  return (
    <div className="shell soft">
      <ContactBar contactName={contact.name} payerName={payer.name} />
      <main className="content">
        <h1>Requests for you</h1>
        {items.map(({ p, payeeName, rerouted }) => (
          <article key={p.id} className="card card-green">
            <p style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: 0 }}>
              <span className="pill pill-amber">Needs your review</span>
              <span className="muted small">{formatWhen(p.createdAt, tz)}</span>
            </p>
            <p style={{ fontWeight: 800, fontSize: "1.15rem", margin: "12px 0 4px" }}>{payer.name} → {payeeName}</p>
            <p className="num" style={{ fontWeight: 800, fontSize: "1.3rem", margin: 0 }}>{formatEur(p.amountMinor)}</p>
            {rerouted && <p className="box-blue" style={{ margin: "12px 0" }}>This payment is to another trusted contact&apos;s account, so it needs your review.</p>}
            <p style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {p.payerConfirmedAt ? <><Check /> {payer.name} confirmed she wants to send it.</> : <>Waiting for {payer.name} to confirm.</>}
            </p>
            {p.expiresAt && <p className="muted">Decide by {formatWhen(p.expiresAt, tz)}.</p>}
            <Link className="btn btn-primary" href={`/review/${p.id}`}>Open request</Link>
          </article>
        ))}
        <p className="card card-dashed">{items.length ? "No other requests right now." : "No requests right now."}</p>
      </main>
    </div>
  );
}
