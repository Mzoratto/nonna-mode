import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// Signed, expiring tokens: HMAC-SHA256 over a base64url JSON payload, keyed by
// SESSION_SECRET. Used for email/demo sign-in links and as the session cookie.
const payload = z.object({
  t: z.enum(["PAYER", "CONTACT", "ADMIN"]),
  id: z.uuid(),
  pid: z.uuid().optional(), // payment the link points at, if any
  exp: z.number().int(), // unix seconds
});
export type Actor = z.infer<typeof payload>;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ chars)");
  return s;
}

const mac = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url");

export function signToken(actor: Omit<Actor, "exp">, ttlSeconds: number, nowMs = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...actor, exp: Math.floor(nowMs / 1000) + ttlSeconds })).toString("base64url");
  return `${body}.${mac(body)}`;
}

export function verifyToken(token: string, nowMs = Date.now()): Actor | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(mac(body));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const r = payload.safeParse(parsed);
  if (!r.success || r.data.exp * 1000 <= nowMs) return null;
  return r.data;
}
