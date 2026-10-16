import "server-only";
import { z } from "zod";

// ponytail: only phase-0 vars; later phases add theirs here.
const schema = z.object({
  APP_BASE_URL: z.url(),
  PAYPAL_ENV: z.literal("sandbox", { error: "Nonna Mode is sandbox-only: PAYPAL_ENV must be 'sandbox'" }),
  PAYPAL_CLIENT_ID: z.string().min(1),
  PAYPAL_CLIENT_SECRET: z.string().min(1),
  PAYPAL_WEBHOOK_ID: z.string().min(1).optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

// Lazy so `next build` doesn't need secrets.
export function env(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}
