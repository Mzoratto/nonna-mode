import Link from "next/link";
import { ArrowRight } from "@/app/icons";
import { Avatar, PayerBar, SandboxNote } from "@/app/ui";
import { requireActor } from "@/server/auth/session";
import { contactsOf, payerHome } from "@/server/views";
import { formatEur, formatWhen } from "@/shared/format";
import { statusView } from "@/shared/status";

export const dynamic = "force-dynamic";

export default async function Payments() {
  const actor = await requireActor("PAYER");
  const [{ payer, rows }, contacts] = await Promise.all([payerHome(actor.id), contactsOf(actor.id)]);
  if (!payer) return <p className="alert">Account not found.</p>;
  const first = contacts.find((c) => c.active);
  return (
    <div className="shell">
      <PayerBar help={first ? { name: first.name, phone: first.phone } : undefined} />
      <main className="content">
        <h1>Hello, {payer.name}</h1>
        <p className="muted">Payments that look risky are paused until someone you trust has a look. Nothing is sent while a payment is paused.</p>
        <div className="stack"><Link className="btn btn-primary" href="/send">Send money <ArrowRight /></Link></div>
        <h2>Your payments</h2>
        {rows.length === 0 && <p className="card card-dashed">No payments yet.</p>}
        {rows.map(({ p, payeeName }) => (
          <Link key={p.id} href={`/payments/${p.id}`} className="choice" style={{ textDecoration: "none" }}>
            <Avatar name={payeeName} />
            <span className="who">
              <span className="name">{formatEur(p.amountMinor)} to {payeeName}</span>
              <span className="rel">{statusView(p.state, p.flagged).title}</span>
              <span className="rel small">{formatWhen(p.createdAt, payer.timezone)}{p.isSeed && " · demo seed data"}</span>
            </span>
          </Link>
        ))}
      </main>
      <footer className="foot"><SandboxNote /></footer>
    </div>
  );
}
