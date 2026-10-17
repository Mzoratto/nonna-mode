import Link from "next/link";
import { ERROR_TEXT } from "@/shared/errors";
import { ChevronLeft, Phone, Shield } from "./icons";

const AVATAR_COLORS = ["#7b3f8c", "#2f5597", "#4d6b3c", "#8b4513", "#1d4e47", "#5b6461"];

export const initials = (name: string) =>
  name.replace(/^Avv\.\s*/, "A ").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
export const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

export function Avatar({ name, color, label }: { name: string; color?: string; label?: string }) {
  // Stable color per name, so Luca is always the same blue.
  const c = color ?? AVATAR_COLORS[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return <span className="avatar" style={{ background: c }} aria-hidden="true">{label ?? initials(name)}</span>;
}

/** Payer header: brand (or Back) on the left, Help (calls the first trusted contact) on the right. */
export function PayerBar({ back, help }: { back?: string; help?: { name: string; phone: string | null } }) {
  return (
    <header className="bar">
      {back ? (
        <Link className="btn btn-chip" href={back}><ChevronLeft size={20} /> Back</Link>
      ) : (
        <Link className="brand" href="/payments"><Shield size={30} /> Nonna Mode</Link>
      )}
      <span className="spacer" />
      {help?.phone && (
        <a className="btn btn-help" href={`tel:${help.phone.replace(/\s/g, "")}`} aria-label={`Help: call ${help.name}`}>
          <Phone size={20} /> Help
        </a>
      )}
    </header>
  );
}

/** Trusted-contact header + "Signed in as …" line (comps 7–9). */
export function ContactBar({ title, back, contactName, payerName }: { title?: string; back?: string; contactName: string; payerName: string }) {
  return (
    <header>
      <div className="bar">
        {back ? (
          <Link className="btn btn-chip" href={back} aria-label="Back to requests"><ChevronLeft size={20} /></Link>
        ) : (
          <span className="brand"><Shield size={30} /> Nonna Mode</span>
        )}
        {title && <span className="bar-title">{title}</span>}
        <span className="spacer" />
        <span className="pill pill-green">PayPal Sandbox</span>
      </div>
      <p className="signed-in">Signed in as <strong>{contactName}</strong> · trusted contact for {payerName}</p>
    </header>
  );
}

export function SandboxNote() {
  return <p className="fine">Test mode (PayPal Sandbox). Protects payments made in Nonna Mode, not in the PayPal app.</p>;
}

export function ErrorFromQuery({ code }: { code?: string }) {
  if (!code) return null;
  return <p className="alert" role="alert">{ERROR_TEXT[code] ?? "Something went wrong. Please try again."}</p>;
}
