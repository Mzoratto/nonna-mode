import { thresholdAction } from "@/app/actions";
import { Shield } from "@/app/icons";
import { requireActor } from "@/server/auth/session";
import { contactsOf, payerHome } from "@/server/views";
import { formatEur } from "@/shared/format";

export const dynamic = "force-dynamic";

// Minimal setup: the second-look amount. Everything else is seeded (ui-context.md §6).
export default async function Admin({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const actor = await requireActor("ADMIN");
  const [{ payer }, contacts] = await Promise.all([payerHome(actor.id), contactsOf(actor.id)]);
  const { saved, error } = await searchParams;
  if (!payer) return <p className="alert">Not found.</p>;
  return (
    <div className="shell">
      <header className="bar"><span className="brand"><Shield size={30} /> Nonna Mode</span><span className="spacer" /><span className="pill pill-gray">Setup</span></header>
      <main className="content">
        <h1>Setup for {payer.name}</h1>
        {saved && <p className="box-green" role="status">Saved.</p>}
        {error && <p className="alert" role="alert">Please enter an amount in euros, like 200.</p>}
        <form action={thresholdAction} className="card">
          <label className="field-label" htmlFor="threshold" style={{ marginTop: 0 }}>Second look above</label>
          <p className="muted small">Payments above this amount are paused for a trusted contact. Exactly this amount is not. Now: {formatEur(payer.thresholdMinor)}.</p>
          <input id="threshold" name="threshold" type="text" inputMode="decimal" defaultValue={(payer.thresholdMinor / 100).toString()} />
          <div className="stack"><button className="btn btn-primary" type="submit">Save</button></div>
        </form>
        <h2>Trusted contacts</h2>
        {contacts.map((c) => (
          <p key={c.id} className="card" style={{ margin: "8px 0" }}><strong>{c.priority}. {c.name}</strong><br /><span className="muted small">{c.emailNormalized}{c.phone && ` · ${c.phone}`}</span></p>
        ))}
      </main>
    </div>
  );
}
