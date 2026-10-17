import { formatWhen } from "@/shared/format";
import type { Line } from "@/shared/audit-text";
import { Avatar, firstName } from "./ui";

const WHO = {
  payer: { label: (p: string) => p, color: "#1d4e47" },
  safety: { label: () => "Safety check", color: "#8b4513" },
  paypal: { label: () => "PayPal", color: "#141b19" },
  system: { label: () => "Nonna Mode", color: "#5b6461" },
} as const;

/** Comp 6: one card per event, with who/when; safety-check lines highlighted. */
export function History({ lines, tz, payerLabel, payerName, contactName, contactNames }: {
  lines: Line[]; tz: string; payerLabel: string; payerName: string;
  contactName: (id?: string) => string; contactNames: string[];
}) {
  return (
    <>
      <ol className="events">
        {lines.map((l) => {
          const label = l.who === "contact" ? firstName(contactName(l.contactId)) : WHO[l.who].label(payerLabel);
          return (
            <li key={l.id} className={`event${l.highlight ? " alert-event" : ""}`}>
              {l.who === "contact" ? (
                <Avatar name={contactName(l.contactId)} />
              ) : (
                <Avatar name={label} color={WHO[l.who].color} label={l.who === "payer" ? payerName[0] : l.who === "safety" ? "!" : l.who === "paypal" ? "PP" : "NM"} />
              )}
              <div>
                <p className="meta" style={{ margin: 0 }}>
                  <strong><time dateTime={l.at.toISOString()}>{formatWhen(l.at, tz)}</time></strong> · {label}
                </p>
                <p style={{ margin: "4px 0 0" }}>{l.text}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="muted small">Nobody can change or delete this history. {contactNames.map(firstName).join(" and ")} see the same list.</p>
    </>
  );
}
