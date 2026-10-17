import { requireActor } from "@/server/auth/session";
import { contactsOf, payeesOf, payerHome } from "@/server/views";
import { SendForm } from "./send-form";

export const dynamic = "force-dynamic";

export default async function Send() {
  const actor = await requireActor("PAYER");
  const [{ payer }, payees, contacts] = await Promise.all([payerHome(actor.id), payeesOf(actor.id), contactsOf(actor.id)]);
  if (!payer) return <p className="alert">Account not found.</p>;
  const first = contacts.find((c) => c.active);
  return (
    <SendForm
      payees={payees.map((p) => ({ id: p.id, name: p.displayName, relationship: p.relationship, isNew: p.isNew }))}
      thresholdMinor={payer.thresholdMinor}
      contacts={contacts.filter((c) => c.active).map((c) => c.name)}
      help={first ? { name: first.name, phone: first.phone } : null}
    />
  );
}
