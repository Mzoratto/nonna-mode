"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { type SendState, sendAction } from "@/app/actions";
import { ArrowRight, Backspace, Check, ChevronLeft, Clipboard, Phone, Shield } from "@/app/icons";
import { Avatar, firstName, SandboxNote } from "@/app/ui";
import { parseEurToMinor } from "@/server/money";
import { formatEur } from "@/shared/format";

type Payee = { id: string; name: string; relationship: string | null; isNew: boolean };
type Props = { payees: Payee[]; thresholdMinor: number; contacts: string[]; help: { name: string; phone: string | null } | null };

// Comps 1–3: Who → How much → A few questions → PayPal. One submission at the end.
export function SendForm({ payees, thresholdMinor, contacts, help }: Props) {
  const [state, action, pending] = useActionState<SendState, FormData>(sendAction, {});
  const [step, setStep] = useState<1 | 2 | 3>(state.error ? 3 : 1);
  const [payeeId, setPayeeId] = useState(state.values?.payeeId ?? "");
  const [amount, setAmount] = useState(state.values?.amount ?? "");
  const [note, setNote] = useState(state.values?.note ?? "");
  const [asked, setAsked] = useState<"yes" | "no" | null>(state.values?.pastedMessage ? "yes" : null);
  const [pasted, setPasted] = useState(state.values?.pastedMessage ?? "");
  const [unsure, setUnsure] = useState(false);
  const [pasteHint, setPasteHint] = useState("");

  const payee = payees.find((p) => p.id === payeeId);
  const minor = parseEurToMinor(amount);
  const press = (k: string) =>
    setAmount((a) => (k === "⌫" ? a.slice(0, -1) : k === "," ? (/[.,]/.test(a) ? a : (a || "0") + ",") : (a === "0" ? k : a + k)).slice(0, 9));

  async function pasteFromClipboard() {
    try {
      const t = await navigator.clipboard.readText();
      if (t.trim()) setPasted(t.slice(0, 4000));
      setPasteHint(t.trim() ? "Pasted." : "Your clipboard is empty.");
    } catch {
      setPasteHint("Your browser didn't allow pasting. Press and hold in the box and choose Paste.");
    }
  }

  const bar = (
    <header className="bar">
      {step === 1 ? (
        <Link className="brand" href="/payments"><Shield size={30} /> Nonna Mode</Link>
      ) : (
        <button type="button" className="btn btn-chip" onClick={() => setStep((s) => (s - 1) as 1 | 2)}>
          <ChevronLeft size={20} /> Back
        </button>
      )}
      <span className="spacer" />
      {help?.phone && (
        <a className="btn btn-help" href={`tel:${help.phone.replace(/\s/g, "")}`} aria-label={`Help: call ${help.name}`}>
          <Phone size={20} /> Help
        </a>
      )}
    </header>
  );

  return (
    <div className="shell">
      {bar}
      <form action={action} className="content" id="send" aria-live="polite">
        <input type="hidden" name="payeeId" value={payeeId} />
        <input type="hidden" name="amount" value={amount} />
        <input type="hidden" name="note" value={note} />
        <input type="hidden" name="pastedMessage" value={asked === "yes" ? pasted : ""} />
        {unsure && <input type="hidden" name="unsure" value="on" />}

        {step === 1 && (
          <>
            <p className="step">Step 1 of 3</p>
            <h1>Who do you want to pay?</h1>
            <div role="radiogroup" aria-label="Who do you want to pay?">
              {payees.map((p) => (
                <button key={p.id} type="button" role="radio" aria-checked={payeeId === p.id} className="choice" onClick={() => setPayeeId(p.id)}>
                  <Avatar name={p.name} />
                  <span className="who">
                    <span className="name">{p.name}</span>
                    {p.isNew ? <span className="new">New. You have never paid them.</span> : p.relationship && <span className="rel">{p.relationship}</span>}
                  </span>
                  {payeeId === p.id && <span className="avatar" style={{ background: "var(--green)", width: 40, height: 40 }}><Check size={22} /></span>}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 2 && payee && (
          <>
            <p className="step">Step 2 of 3</p>
            <h1>How much?</h1>
            <p>To <strong>{payee.name}</strong></p>
            <label className="amount-box">
              <span className="sr-only">Amount in euros</span>
              <input
                inputMode="decimal" autoComplete="off" value={amount ? `€ ${amount}` : ""} placeholder="€ 0"
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, "").slice(0, 9))}
              />
            </label>
            <p className="muted">
              Your limit is {formatEur(thresholdMinor)}. Bigger payments get a second look before they are sent.
              {minor !== null && <> That&apos;s <strong>{formatEur(minor)}</strong>.</>}
            </p>
            <div className="keypad" aria-label="Number pad">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "⌫"].map((k) => (
                <button key={k} type="button" onClick={() => press(k)} aria-label={k === "⌫" ? "Delete" : k === "," ? "Decimal comma" : k}>
                  {k === "⌫" ? <Backspace size={30} /> : k}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 3 && payee && minor !== null && (
          <>
            <p className="step">Step 3 of 3</p>
            <h1>A few questions</h1>
            {state.error && <p className="alert" role="alert">{state.error}</p>}

            <label className="field-label" htmlFor="note-input">What is the money for?</label>
            <input id="note-input" type="text" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />

            <p className="field-label" id="asked-label">Did someone call or message you asking for this money?</p>
            <div className="yesno" role="radiogroup" aria-labelledby="asked-label">
              {(["yes", "no"] as const).map((v) => (
                <button key={v} type="button" role="radio" aria-checked={asked === v} className="choice" onClick={() => setAsked(v)}>
                  {v === "yes" ? "Yes" : "No"}
                </button>
              ))}
            </div>

            {asked === "yes" && (
              <div className="panel">
                <label className="field-label" htmlFor="pasted" style={{ marginTop: 0 }}>What did they say?</label>
                <p className="muted small">Paste their message or write it in your own words. We&apos;ll check it for you.</p>
                <textarea id="pasted" maxLength={4000} value={pasted} onChange={(e) => setPasted(e.target.value)} />
                <button type="button" className="btn" style={{ minHeight: 52, marginTop: 10 }} onClick={pasteFromClipboard}>
                  <Clipboard size={20} /> Paste a message
                </button>
                {pasteHint && <p className="small muted" role="status">{pasteHint}</p>}
              </div>
            )}

            <button type="button" role="checkbox" aria-checked={unsure} className="choice" onClick={() => setUnsure((u) => !u)}>
              <span className="who">
                <span className="name">I&apos;m not sure</span>
                <span className="rel">Ask {contacts.map(firstName).join(" or ")} to check it with me</span>
              </span>
              {unsure && <Check size={28} />}
            </button>

            <div className="card card-strong">
              <p className="muted" style={{ margin: 0 }}>You are about to pay</p>
              <p style={{ fontWeight: 800, fontSize: "1.4rem", margin: "4px 0" }}>{formatEur(minor)} to {payee.name}</p>
              <p style={{ margin: 0 }}>Nothing is sent yet. Next, PayPal will ask you to confirm.</p>
            </div>
          </>
        )}
      </form>

      <footer className="foot">
        {step < 3 ? (
          <button
            type="button" className="btn btn-primary"
            disabled={step === 1 ? !payee : minor === null}
            onClick={() => setStep((s) => (s + 1) as 2 | 3)}
          >
            Next <ArrowRight />
          </button>
        ) : (
          <button type="submit" form="send" className="btn btn-primary" disabled={pending || asked === null}>
            {pending ? "Checking…" : <>Continue to PayPal <ArrowRight /></>}
          </button>
        )}
        {step === 1 && <SandboxNote />}
      </footer>
    </div>
  );
}
