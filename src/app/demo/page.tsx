import Link from "next/link";
import { startDemoAction } from "@/app/actions";
import { ArrowRight, Shield } from "@/app/icons";
import { Avatar, ErrorFromQuery, SandboxNote } from "@/app/ui";
import { verifyToken } from "@/server/auth/links";
import { scenarioLinks } from "@/server/demo";
import { contactsOf } from "@/server/views";

export const dynamic = "force-dynamic";

const base = () => process.env.APP_BASE_URL ?? "http://localhost:3000";

// /demo: one button creates an isolated scenario; then each actor's demo-only sign-in link.
export default async function Demo({ searchParams }: { searchParams: Promise<{ k?: string; error?: string }> }) {
  const { k, error } = await searchParams;
  const scenario = k ? verifyToken(k) : null;
  const contacts = scenario?.t === "ADMIN" ? await contactsOf(scenario.id) : [];
  const luca = contacts.find((c) => c.priority === 1);
  const giulia = contacts.find((c) => c.priority === 2);
  const links = scenario && luca && giulia
    ? scenarioLinks({ payer: scenario.id, luca: luca.id, giulia: giulia.id }, base())
    : null;
  const buyer = process.env.DEMO_BUYER_EMAIL;

  return (
    <div className="shell">
      <header className="bar"><Link className="brand" href="/"><Shield size={30} /> Nonna Mode</Link></header>
      <main className="content">
        <ErrorFromQuery code={error} />
        <h1>Try the demo</h1>
        {!links ? (
          <>
            <p>You&apos;ll get your own family to play with: <strong>Rosa</strong>, who sends money, and her children <strong>Luca</strong> and <strong>Giulia</strong>, her trusted contacts.</p>
            <p className="muted">Everything runs in the PayPal sandbox. No real money moves. Nonna Mode protects only payments made through it, not the PayPal app.</p>
            <form action={startDemoAction} className="stack"><button className="btn btn-primary" type="submit">Start a demo <ArrowRight /></button></form>
          </>
        ) : (
          <>
            <p className="box-green">Your demo is ready. Open each person in a <strong>separate browser profile or private window</strong>, so they stay signed in side by side.</p>
            {[
              { name: "Rosa", role: "Sends money", href: links.payer },
              { name: luca!.name, role: "Trusted contact, asked first", href: links.luca },
              { name: giulia!.name, role: "Trusted contact, asked second", href: links.giulia },
            ].map((a) => (
              <div key={a.name} className="card" style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <Avatar name={a.name} />
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 800 }}>{a.name}</p>
                  <p className="muted small" style={{ margin: 0 }}>{a.role}</p>
                  <p className="copy">{a.href}</p>
                </div>
                <a className="btn btn-chip" href={a.href} target="_blank" rel="noreferrer">Open</a>
              </div>
            ))}
            <h2>Approving in PayPal</h2>
            <p>PayPal will ask Rosa to log in. Use the sandbox buyer account{buyer ? <>: <strong>{buyer}</strong>{process.env.DEMO_BUYER_PASSWORD && <> / <strong>{process.env.DEMO_BUYER_PASSWORD}</strong></>}</> : " listed in the README"}.</p>
            <h2>Try this</h2>
            <ol>
              <li>As Rosa, pay <strong>Avv. Ferri</strong> €2,000 and paste: <em>“Nonna it&apos;s me Matteo, I&apos;m in jail after an accident. Send bail today and don&apos;t tell mamma.”</em></li>
              <li>As Luca, decline it. PayPal voids the hold.</li>
              <li>As Rosa, pay <strong>Luca Bianchi</strong> €900 and confirm. As Luca, try to approve: refused, and Giulia is asked instead.</li>
            </ol>
            <p><Link href={`/demo/outbox?k=${k}`}>See the notices we would email (outbox)</Link></p>
            <p className="muted small">Demo-only sign-in links, valid for 24 hours.</p>
          </>
        )}
      </main>
      <footer className="foot"><SandboxNote /></footer>
    </div>
  );
}
