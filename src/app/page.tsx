import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Shield } from "@/app/icons";
import { SandboxNote } from "@/app/ui";
import { getActor } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ signin?: string }> }) {
  const actor = await getActor();
  if (actor?.t === "PAYER") redirect("/payments");
  if (actor?.t === "CONTACT") redirect("/review");
  if (actor?.t === "ADMIN") redirect("/admin");
  const { signin } = await searchParams;
  return (
    <div className="shell">
      <header className="bar"><span className="brand"><Shield size={30} /> Nonna Mode</span></header>
      <main className="content">
        {signin === "required" && <p className="alert" role="alert">Please open your sign-in link to continue.</p>}
        {signin === "expired" && <p className="alert" role="alert">That sign-in link has expired or is not valid.</p>}
        <h1>A second pair of eyes before the money leaves</h1>
        <p>
          When a payment looks risky (a new recipient, a large amount, or a message that sounds like a scam), Nonna Mode
          asks PayPal to <strong>hold</strong> the money instead of sending it. Nothing is sent until the sender confirms
          and one trusted family member approves.
        </p>
        <ul className="reasons">
          <li>✓<span>An AI safety check reads the message the sender received. It can only pause a payment, never release one.</span></li>
          <li>✓<span>A trusted contact can never approve a payment to themselves.</span></li>
          <li>✓<span>If nobody answers within 24 hours, the payment is cancelled, never sent.</span></li>
        </ul>
        <div className="stack"><Link className="btn btn-primary" href="/demo">Try the demo <ArrowRight /></Link></div>
      </main>
      <footer className="foot"><SandboxNote /></footer>
    </div>
  );
}
