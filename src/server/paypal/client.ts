import "server-only";
import { z } from "zod";
import { env } from "@/env";
import { minorToValue } from "@/server/money";

// Sandbox only — src/env.ts refuses any other PAYPAL_ENV.
const BASE = "https://api-m.sandbox.paypal.com";
const TIMEOUT_MS = 15_000;

/** PayPal answered with an error. A timeout is NOT this: it throws the raw abort error and the result is unknown. */
export class PayPalError extends Error {
  constructor(
    readonly status: number,
    readonly errorName: string | undefined,
    readonly debugId: string | undefined,
    readonly details: unknown,
  ) {
    super(`PayPal ${status} ${errorName ?? ""} debug_id=${debugId ?? "?"}`);
  }
}

const errorBody = z.object({ name: z.string().optional(), debug_id: z.string().optional(), details: z.unknown().optional() });

let token: { value: string; expiresAt: number } | undefined;

async function accessToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET } = env();
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new PayPalError(res.status, "AUTH_FAILED", undefined, undefined);
  const body = z.object({ access_token: z.string(), expires_in: z.number() }).parse(await res.json());
  token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return token.value;
}

async function req<T>(
  method: "GET" | "POST",
  path: string,
  schema: z.ZodType<T>,
  opts: { body?: unknown; requestId?: string } = {},
): Promise<T | null> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await accessToken()}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  if (opts.requestId) headers["PayPal-Request-Id"] = opts.requestId;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  const json: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const e = errorBody.safeParse(json);
    throw new PayPalError(res.status, e.data?.name, e.data?.debug_id, e.data?.details);
  }
  return json === null ? null : schema.parse(json);
}

function must<T>(v: T | null, what: string): T {
  if (v === null) throw new Error(`PayPal returned an empty body for ${what}`);
  return v;
}

// ---- Domain shapes (provider payloads stay inside this module) ----

export type Payee = { email_address: string } | { merchant_id: string };

const link = z.object({ rel: z.string(), href: z.string() });
const authorization = z.object({
  id: z.string(),
  status: z.string(),
  expiration_time: z.string().optional(),
  create_time: z.string().optional(),
});
const order = z.object({
  id: z.string(),
  status: z.string(),
  links: z.array(link).optional(),
  purchase_units: z
    .array(z.object({ payments: z.object({ authorizations: z.array(authorization).optional() }).optional() }))
    .optional(),
});
const capture = z.object({ id: z.string(), status: z.string() });

export type Authorization = z.infer<typeof authorization>;

function firstAuthorization(o: z.infer<typeof order>): Authorization | undefined {
  return o.purchase_units?.[0]?.payments?.authorizations?.[0];
}

// ---- Endpoints ----

export async function createOrder(input: {
  amountMinor: number;
  payee?: Payee;
  customId: string;
  returnUrl: string;
  cancelUrl: string;
  requestId: string;
}) {
  const o = must(
    await req("POST", "/v2/checkout/orders", order, {
      requestId: input.requestId,
      body: {
        intent: "AUTHORIZE",
        purchase_units: [
          {
            custom_id: input.customId,
            amount: { currency_code: "EUR", value: minorToValue(input.amountMinor) },
            ...(input.payee ? { payee: input.payee } : {}),
          },
        ],
        payment_source: {
          paypal: { experience_context: { return_url: input.returnUrl, cancel_url: input.cancelUrl } },
        },
      },
    }),
    "createOrder",
  );
  const approveUrl = o.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
  return { id: o.id, status: o.status, approveUrl };
}

export async function getOrder(orderId: string) {
  const o = must(await req("GET", `/v2/checkout/orders/${encodeURIComponent(orderId)}`, order), "getOrder");
  return { id: o.id, status: o.status, authorization: firstAuthorization(o) };
}

export async function authorizeOrder(orderId: string, requestId: string) {
  const o = must(
    await req("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`, order, { requestId, body: {} }),
    "authorizeOrder",
  );
  return { orderStatus: o.status, authorization: firstAuthorization(o) };
}

export async function getAuthorization(authorizationId: string) {
  return must(
    await req("GET", `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}`, authorization),
    "getAuthorization",
  );
}

export async function captureAuthorization(authorizationId: string, requestId: string) {
  return must(
    await req("POST", `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/capture`, capture, {
      requestId,
      body: { final_capture: true },
    }),
    "captureAuthorization",
  );
}

/** Returns the authorization if PayPal sends a body, else null (204) — callers confirm with getAuthorization. */
export async function voidAuthorization(authorizationId: string, requestId: string) {
  return req("POST", `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`, authorization, {
    requestId,
  });
}

export async function verifyWebhookSignature(headers: Headers, event: unknown): Promise<boolean> {
  const webhookId = env().PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw new Error("PAYPAL_WEBHOOK_ID is not set");
  const h = (name: string) => headers.get(name) ?? "";
  const res = must(
    await req("POST", "/v1/notifications/verify-webhook-signature", z.object({ verification_status: z.string() }), {
      body: {
        auth_algo: h("paypal-auth-algo"),
        cert_url: h("paypal-cert-url"),
        transmission_id: h("paypal-transmission-id"),
        transmission_sig: h("paypal-transmission-sig"),
        transmission_time: h("paypal-transmission-time"),
        webhook_id: webhookId,
        webhook_event: event,
      },
    }),
    "verifyWebhookSignature",
  );
  return res.verification_status === "SUCCESS";
}
