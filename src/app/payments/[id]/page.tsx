import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelAction, confirmAction } from "@/app/actions";
import { Banknote, Check, Cross, MessageAlert, Pause, Person, Phone, Question } from "@/app/icons";
import { Avatar, ErrorFromQuery, firstName, PayerBar } from "@/app/ui";
import { requireActor } from "@/server/auth/session";
import type { FlagReason } from "@/server/db/schema";
import { paymentDetail } from "@/server/views";
import { formatEur, formatWhen } from "@/shared/format";
import { TRANSITIONAL } from "@/shared/status";

export const dynamic = "force-dynamic";

const tel = (phone: string) => `tel:${phone.replace(/\s/g, "")}`;

export default async function PaymentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const actor = await requireActor("PAYER");
  const { id } = await params;
  const d = await paymentDetail(id).catch(() => null);
  if (!d || d.p.payerId !== actor.id) notFound();
  const { p, payee, payer, contacts, decisions, audit } = d;
  const { error } = await searchParams;
  const tz = payer.timezone;
  const amount = formatEur(p.amountMinor);
  const active = contacts.filter((c) => c.active);
  const first = active[0];
  const help = first ? { name: first.name, phone: first.phone } : undefined;
  const callFirst = first?.phone && (
    <a className="btn btn-primary" href={tel(first.phone)}><Phone /> Call {firstName(first.name)}</a>
  );
  const shell = (body: React.ReactNode, foot?: React.ReactNode) => (
    <div className="shell">
      <PayerBar help={help} />
      <main className="content">
        <ErrorFromQuery code={error} />
        {body}
      </main>
      {foot && <footer className="foot foot-inline">{foot}</footer>}
    </div>
  );

  // ---- comp 4: paused, waiting for Rosa's answer --------------------------------
  if ((p.state === "PENDING_REVIEW" || p.state === "ESCALATED") && !p.payerConfirmedAt) {
    const why: Partial<Record<FlagReason, [React.ReactNode, string]>> = {
      NEW_PAYEE: [<Person key="i" />, "You have never paid this person before."],
      OVER_THRESHOLD: [<Banknote key="i" />, `It is more than your ${formatEur(payer.thresholdMinor)} limit.`],
      PAYER_UNSURE: [<Question key="i" />, "You said you weren't sure about it."],
      AI_CHECK_UNAVAILABLE: [<MessageAlert key="i" />, "We couldn't check the message, so we paused it to be careful."],
    };
    return shell(
      <>
        <div className="hero">
          <div className="hero-icon hero-paused"><Pause /></div>
          <h1>We paused this payment</h1>
          <p><strong>{amount}</strong> to {payee.displayName}</p>
        </div>
        <p className="box-green">Nothing has been sent. The money is still in your account.</p>
        <h2>Why?</h2>
        <ul className="reasons">
          {p.flaggedReasons.filter((r) => why[r]).map((r) => <li key={r}>{why[r]![0]}<span>{why[r]![1]}</span></li>)}
        </ul>
        {p.flaggedReasons.includes("AI_SCAM_PATTERN") && (
          <div className="box-amber">
            <span className="ico"><MessageAlert /></span>
            <p style={{ margin: 0 }}>{p.aiEvidence} Scammers often say this.</p>
          </div>
        )}
        {(p.pastedMessage || p.flaggedReasons.includes("AI_SCAM_PATTERN")) && first && (
          <div className="card card-green">
            <h2 style={{ marginTop: 0 }}>Good idea: call them yourself</h2>
            <p>Use the number you already have for them, not a number from the message. Or talk to {firstName(first.name)} first.</p>
            {callFirst}
          </div>
        )}
        <h2>Do you still want to send it?</h2>
        {p.expiresAt && <p className="muted small">If nobody approves it by {formatWhen(p.expiresAt, tz)}, it will be cancelled.</p>}
        <div className="stack">
          <form action={cancelAction}>
            <input type="hidden" name="paymentId" value={p.id} />
            <button className="btn btn-ink" type="submit"><Cross /> No, cancel it</button>
          </form>
          <form action={confirmAction}>
            <input type="hidden" name="paymentId" value={p.id} />
            <button className="btn" type="submit"><Check /> Yes, send it</button>
          </form>
        </div>
        <p className="muted small center">If you say yes, {active.map((c) => firstName(c.name)).join(" or ")} will check it before anything is sent.</p>
      </>,
    );
  }

  // ---- confirmed, waiting for a trusted contact ---------------------------------
  if (p.state === "PENDING_REVIEW" || p.state === "ESCALATED") {
    return shell(
      <>
        <div className="hero">
          <div className="hero-icon hero-wait"><Pause /></div>
          <h1>Waiting for a second look</h1>
          <p><strong>{amount}</strong> to {payee.displayName}</p>
        </div>
        <p className="box-green">Nothing has been sent. The money is still in your account.</p>
        <p>You said yes. Now {p.state === "ESCALATED" ? active.map((c) => firstName(c.name)).join(" or ") : first ? firstName(first.name) : "a trusted contact"} needs to check it.</p>
        {p.expiresAt && <p className="muted">If nobody decides by {formatWhen(p.expiresAt, tz)}, it will be cancelled and nothing will be sent.</p>}
        <div className="stack">
          {callFirst}
          <Link className="btn" href={`/payments/${p.id}/history`}>See what happened</Link>
          <form action={cancelAction}>
            <input type="hidden" name="paymentId" value={p.id} />
            <button className="linkbtn" type="submit">Changed your mind? Cancel it</button>
          </form>
        </div>
      </>,
    );
  }

  // ---- comp 5: not sent ------------------------------------------------------------
  if (p.state === "VOIDED") {
    const confirmed = [...audit].reverse().find((e) => e.action === "VOID_CONFIRMED");
    const said = decisions.find((x) => x.accepted && x.type === "DECLINE" && x.actorType === "CONTACT");
    const decider = said && contacts.find((c) => c.id === said.actorId);
    const cancelledByYou = decisions.some((x) => x.accepted && x.type === "PAYER_CANCEL");
    return shell(
      <>
        <div className="hero">
          <div className="hero-icon hero-ok"><Check size={44} /></div>
          <h1>Your money was not sent</h1>
          <p><strong>{amount}</strong> is still in your account.</p>
          {confirmed && <p className="muted small">PayPal confirmed it {formatWhen(confirmed.createdAt, tz)}.</p>}
        </div>
        {decider ? (
          <div className="card" style={{ display: "flex", gap: 16, background: "var(--page-soft)" }}>
            <Avatar name={decider.name} />
            <div>
              <p style={{ margin: 0, fontWeight: 800 }}>{firstName(decider.name)} said no</p>
              {said.message && <p style={{ margin: "6px 0 0" }}>“{said.message}”</p>}
            </div>
          </div>
        ) : (
          <p className="card">{cancelledByYou ? "You cancelled it." : "Nobody approved it in time, so it was cancelled."}</p>
        )}
        <p>You did the right thing. If someone asks you for money again, you can always pause it here.</p>
      </>,
      <div className="stack" style={{ margin: 0 }}>
        {decider?.phone ? <a className="btn btn-primary" href={tel(decider.phone)}><Phone /> Call {firstName(decider.name)}</a> : callFirst}
        <Link className="btn" href={`/payments/${p.id}/history`}>See what happened</Link>
        <Link className="center" href="/payments">Go to the start</Link>
      </div>,
    );
  }

  // ---- sent ------------------------------------------------------------------------
  if (p.state === "CAPTURED") {
    const ok = decisions.find((x) => x.accepted && x.type === "APPROVE");
    const approver = ok && contacts.find((c) => c.id === ok.actorId);
    return shell(
      <>
        <div className="hero">
          <div className="hero-icon hero-ok"><Check size={44} /></div>
          <h1>Payment sent</h1>
          <p><strong>{amount}</strong> to {payee.displayName}</p>
          {p.isSeed && <p className="pill pill-gray">Demo seed data, not a live PayPal operation</p>}
        </div>
        {approver && <p className="card">{firstName(approver.name)} checked it and said yes.{ok.message && <> “{ok.message}”</>}</p>}
      </>,
      <div className="stack" style={{ margin: 0 }}>
        <Link className="btn" href={`/payments/${p.id}/history`}>See what happened</Link>
        <Link className="center" href="/payments">Go to the start</Link>
      </div>,
    );
  }

  // ---- everything else: short status, refreshes itself while PayPal is working -----
  const text: Record<string, [string, string]> = {
    AWAITING_BUYER: ["Finish approval in PayPal", "Nothing is held until PayPal confirms."],
    AUTHORIZING: ["Checking with PayPal…", "This takes a few seconds."],
    APPROVED: ["Sending…", "Confirming the payment with PayPal."],
    DECLINED: ["Cancelling…", "This payment will not be sent. Confirming with PayPal."],
    EXPIRED: ["Cancelling…", "Nobody decided in time, so it will not be sent. Confirming with PayPal."],
    ABANDONED: ["Not started", "The PayPal approval was never finished. No money was held."],
    FAILED: ["PayPal didn't complete this", "Please don't send it again yet. We're checking what happened."],
  };
  const [title, sub] = text[p.state] ?? ["Checking…", ""];
  return shell(
    <>
      {TRANSITIONAL.includes(p.state) && <meta httpEquiv="refresh" content="3" />}
      <div className="hero">
        <div className="hero-icon hero-wait" aria-hidden="true">{p.state === "FAILED" || p.state === "ABANDONED" ? <Cross size={40} /> : <Pause />}</div>
        <h1>{title}</h1>
        <p><strong>{amount}</strong> to {payee.displayName}</p>
        <p className="muted" role="status">{sub}</p>
      </div>
      {p.state === "AWAITING_BUYER" && (
        <form action={cancelAction} className="stack">
          <input type="hidden" name="paymentId" value={p.id} />
          <button className="btn" type="submit">Cancel this payment</button>
        </form>
      )}
      <p className="center"><Link href={`/payments/${p.id}/history`}>See what happened</Link></p>
    </>,
  );
}
