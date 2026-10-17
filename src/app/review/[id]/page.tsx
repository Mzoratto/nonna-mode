import Link from "next/link";
import { notFound } from "next/navigation";
import { decideAction } from "@/app/actions";
import { ArrowRight, Banknote, Check, Clock, Info, Person, Warning } from "@/app/icons";
import { ContactBar, ErrorFromQuery, firstName } from "@/app/ui";
import { requireActor } from "@/server/auth/session";
import type { AiPattern } from "@/server/db/schema";
import { routedContactIds } from "@/server/decision/service";
import { paymentDetail } from "@/server/views";
import { formatEur, formatWhen } from "@/shared/format";

export const dynamic = "force-dynamic";

const PATTERN: Record<AiPattern, string> = {
  EMERGENCY_OR_BAIL: "emergency / bail",
  IMPERSONATION: "someone pretending to be someone else",
  URGENCY_OR_SECRECY: "urgency / secrecy",
  GIFT_CARD_OR_CRYPTO: "gift cards / crypto",
  OTHER: "common scam",
};

export default async function Review({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const actor = await requireActor("CONTACT");
  const { id } = await params;
  const d = await paymentDetail(id).catch(() => null);
  const me = d?.contacts.find((c) => c.id === actor.id);
  if (!d || !me) notFound();
  const { p, payee, payer, decisions, contacts } = d;
  const { error } = await searchParams;
  const tz = payer.timezone;
  const amount = formatEur(p.amountMinor);
  const others = contacts.filter((c) => c.active && c.id !== me.id);
  const bar = (title?: string) => <ContactBar title={title} back="/review" contactName={me.name} payerName={payer.name} />;

  // ---- comp 8: this contact's approval was refused (payment to their own account) --
  if (decisions.some((x) => !x.accepted && x.rejectionReason === "SELF_DEALING" && x.actorId === me.id)) {
    return (
      <div className="shell soft">
        {bar()}
        <div className="banner-blue" role="alert"><Info /> <h1 className="banner-title">Your approval wasn&apos;t accepted</h1></div>
        <main className="content">
          <dl className="rows">
            <div><dt>To</dt><dd>{payee.displayName}</dd></div>
            <div><dt>Amount</dt><dd className="num">{amount}</dd></div>
          </dl>
          <p>This payment goes to <strong>your own PayPal account</strong>. In Nonna Mode, nobody can approve a payment to themselves. The rule applies to every trusted contact.</p>
          <div className="card" style={{ display: "flex", gap: 14 }}>
            <span style={{ color: "var(--green)" }}><ArrowRight /></span>
            <p style={{ margin: 0 }}>
              {others.length
                ? <><strong>{others.map((o) => firstName(o.name)).join(" and ")} {others.length > 1 ? "have" : "has"} been asked to review it instead.</strong> {payer.name} can see this in her history.</>
                : <><strong>Nobody else could review it, so it was stopped.</strong> No money was sent.</>}
            </p>
          </div>
          <div className="stack"><Link className="btn" href="/review">Back to requests</Link></div>
        </main>
      </div>
    );
  }

  const inReview = p.state === "PENDING_REVIEW" || p.state === "ESCALATED";
  const routed = inReview && (await routedContactIds(p)).includes(me.id);

  // ---- decided, or not this contact's turn yet --------------------------------------
  if (!routed) {
    const mine = decisions.find((x) => x.accepted && x.actorId === me.id);
    const line = !inReview
      ? mine?.type === "APPROVE" ? "You approved it." : mine?.type === "DECLINE" ? "You declined it." : "A decision has already been made."
      : `This isn't waiting for you yet. ${others[0] ? firstName(others[0].name) : "Another contact"} was asked first.`;
    const outcome: Record<string, string> = {
      CAPTURED: "PayPal confirmed the payment was sent.",
      VOIDED: "PayPal confirmed the payment was cancelled. No money was sent.",
      APPROVED: "Confirming the payment with PayPal…",
      DECLINED: "Confirming the cancellation with PayPal…",
      EXPIRED: "Nobody decided in time. Confirming the cancellation with PayPal…",
    };
    return (
      <div className="shell soft">
        {bar("Review")}
        <main className="content">
          {["APPROVED", "DECLINED", "EXPIRED"].includes(p.state) && <meta httpEquiv="refresh" content="3" />}
          <ErrorFromQuery code={error} />
          <h1 className="center num">{amount}</h1>
          <p className="center">{payer.name} → <strong>{payee.displayName}</strong></p>
          <p className="card">{line} {outcome[p.state] ?? ""}</p>
          <div className="stack">
            <Link className="btn" href={`/review/${p.id}/history`}>See what happened</Link>
            <Link className="btn btn-chip" style={{ width: "100%" }} href="/review">Back to requests</Link>
          </div>
        </main>
      </div>
    );
  }

  // ---- comp 7: the review --------------------------------------------------------------
  const isNew = p.flaggedReasons.includes("NEW_PAYEE");
  const quote = p.pastedMessage && (p.pastedMessage.length > 140 ? `${p.pastedMessage.slice(0, 140)}…` : p.pastedMessage);
  return (
    <div className="shell soft">
      {bar("Review")}
      <main className="content">
        <ErrorFromQuery code={error} />
        <div className="center" style={{ paddingTop: 8 }}>
          <span className="pill pill-amber">Needs your review</span>
          <h1 className="amount-xl num" style={{ margin: "12px 0 4px" }}>{amount}</h1>
          <p style={{ margin: 0 }}>{payer.name} → <strong>{payee.displayName}{p.note ? `, ${p.note}` : ""}</strong></p>
          <p className="muted small">Requested {formatWhen(p.createdAt, tz)}</p>
        </div>

        <dl className="rows">
          <div><dt><Check size={20} /> {payer.name}&apos;s answer</dt><dd style={{ color: p.payerConfirmedAt ? "var(--green)" : undefined }}>{p.payerConfirmedAt ? "Confirmed" : "Not yet"}</dd></div>
          <div><dt><Person size={20} /> Recipient</dt><dd>{isNew ? "New" : "Paid before"}</dd></div>
          <div><dt><Banknote size={20} /> {payer.name}&apos;s second-look amount</dt><dd className="num">{formatEur(payer.thresholdMinor)}</dd></div>
          {p.expiresAt && <div><dt><Clock size={20} /> Decide by</dt><dd>{formatWhen(p.expiresAt, tz)}</dd></div>}
        </dl>

        {p.aiPatternLabel ? (
          <div className="card" style={{ borderColor: "var(--amber-line)" }}>
            <h2 style={{ marginTop: 0, display: "flex", gap: 10 }}><span style={{ color: "var(--amber-ink)" }}><Warning /></span> Scam pattern: {PATTERN[p.aiPatternLabel]}</h2>
            <p>{p.briefText ?? p.aiEvidence}</p>
            <p>This matches a common scam. It is not proof.</p>
            {quote && <p className="quote">“{quote}”</p>}
          </div>
        ) : (
          p.briefText && <p className="card">{p.briefText}</p>
        )}

        <p className="tip"><strong>Before you decide:</strong> try calling the person on their usual number, not one from a message.</p>

        <form action={decideAction}>
          <input type="hidden" name="paymentId" value={p.id} />
          <label className="field-label" htmlFor="message">Message to {payer.name} <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></label>
          <textarea id="message" name="message" maxLength={500} />
          {!p.payerConfirmedAt && <p className="muted small">{payer.name} hasn&apos;t confirmed yet, so it can&apos;t be approved. You can still decline it.</p>}
          <div className="stack">
            <button className="btn btn-ink" type="submit" name="verdict" value="DECLINE">Decline</button>
            <button className="btn" type="submit" name="verdict" value="APPROVE" disabled={!p.payerConfirmedAt}>Approve {amount}</button>
          </div>
        </form>
        <p className="center small"><Link href={`/review/${p.id}/history`}>See the full history</Link></p>
      </main>
    </div>
  );
}
