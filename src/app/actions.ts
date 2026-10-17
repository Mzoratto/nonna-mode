"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { signToken } from "@/server/auth/links";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { auditEvent, payer } from "@/server/db/schema";
import { cancelByPayer, confirmByPayer, decide, DecisionError, submitSend } from "@/server/decision/service";
import { createScenario, freshIds } from "@/server/demo";
import { parseEurToMinor } from "@/server/money";
import { PayPalError } from "@/server/paypal/client";

// Every action: validate input with zod, take identity ONLY from the session cookie, call the Decision Service.

const uuid = z.uuid();

/** Map service refusals to ?error= codes; anything unknown about PayPal is "unavailable", never "failed". */
function errorCode(e: unknown): string {
  if (e instanceof DecisionError) return e.code;
  if (e instanceof PayPalError) return "PAYPAL_UNAVAILABLE";
  if (e instanceof Error && /timeout|aborted|fetch failed/i.test(e.message)) return "PAYPAL_UNAVAILABLE";
  throw e;
}

export type SendState = { error?: string; values?: Record<string, string> };

export async function sendAction(_: SendState, form: FormData): Promise<SendState> {
  const actor = await requireActor("PAYER");
  const values = Object.fromEntries(["payeeId", "amount", "note", "pastedMessage"].map((k) => [k, String(form.get(k) ?? "")]));
  const payeeId = uuid.safeParse(values.payeeId);
  const amountMinor = parseEurToMinor(values.amount ?? "");
  if (!payeeId.success) return { error: "Please choose who to send money to.", values };
  if (amountMinor === null) return { error: "Please enter an amount in euros, like 45 or 45,50.", values };
  if ((values.note?.length ?? 0) > 500 || (values.pastedMessage?.length ?? 0) > 4000) return { error: "That text is too long.", values };

  let approveUrl: string | undefined;
  try {
    ({ approveUrl } = await submitSend({
      payerId: actor.id,
      payeeId: payeeId.data,
      amountMinor,
      note: values.note,
      pastedMessage: values.pastedMessage,
      payerUnsure: form.get("unsure") === "on",
    }));
  } catch (e) {
    return { error: errorCode(e) === "PAYPAL_UNAVAILABLE" ? "We couldn't reach PayPal. Nothing was sent. Please try again in a minute." : "We couldn't start this payment.", values };
  }
  if (!approveUrl) return { error: "PayPal didn't return an approval page. Nothing was sent.", values };
  redirect(approveUrl);
}

async function run(back: string, fn: () => Promise<unknown>) {
  let code: string | null = null;
  try {
    await fn();
  } catch (e) {
    code = errorCode(e);
  }
  redirect(code ? `${back}?error=${code}` : back);
}

export async function confirmAction(form: FormData) {
  const actor = await requireActor("PAYER");
  const id = uuid.parse(form.get("paymentId"));
  await run(`/payments/${id}`, () => confirmByPayer(actor.id, id));
}

export async function cancelAction(form: FormData) {
  const actor = await requireActor("PAYER");
  const id = uuid.parse(form.get("paymentId"));
  await run(`/payments/${id}`, () => cancelByPayer(actor.id, id));
}

export async function decideAction(form: FormData) {
  const actor = await requireActor("CONTACT");
  const id = uuid.parse(form.get("paymentId"));
  const verdict = z.enum(["APPROVE", "DECLINE"]).parse(form.get("verdict"));
  const message = z.string().max(500).optional().parse(form.get("message") ?? undefined);
  await run(`/review/${id}`, () => decide(actor.id, id, verdict, message));
}

export async function thresholdAction(form: FormData) {
  const actor = await requireActor("ADMIN"); // admin scope = actor.id (the payer being configured)
  const minor = parseEurToMinor(String(form.get("threshold") ?? ""));
  if (minor === null) redirect("/admin?error=THRESHOLD");
  await db().transaction(async (tx) => {
    const [before] = await tx.select({ t: payer.thresholdMinor }).from(payer).where(eq(payer.id, actor.id));
    await tx.update(payer).set({ thresholdMinor: minor }).where(eq(payer.id, actor.id));
    await tx.insert(auditEvent).values({
      actorType: "ADMIN",
      actorId: actor.id,
      action: "THRESHOLD_CHANGED",
      details: { payer_id: actor.id, from_minor: before?.t ?? null, to_minor: minor },
    });
  });
  redirect("/admin?saved=1");
}

// ponytail: in-memory limiter, fine for one Render instance; move to the DB if we ever scale out.
const demoStarts = new Map<string, number[]>();
const DEMO_LIMIT_PER_HOUR = 10;

export async function startDemoAction() {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const recent = (demoStarts.get(ip) ?? []).filter((t) => t > Date.now() - 3_600_000);
  if (recent.length >= DEMO_LIMIT_PER_HOUR) redirect("/demo?error=RATE_LIMITED");
  demoStarts.set(ip, [...recent, Date.now()]);

  const ids = freshIds();
  await createScenario(db(), ids);
  // Signed: knowing a payer ID must never be enough to mint sign-in links.
  redirect(`/demo?k=${signToken({ t: "ADMIN", id: ids.payer }, 24 * 3600)}`);
}
