// The ONLY place policy durations live. Everything is divided by DEMO_TIME_SCALE
// (360 → 12h becomes 2 min) so the recorded demo can show escalation and expiry.
export const POLICY_HOURS = { abandonBuyer: 3, escalate: 12, expire: 24 } as const;

let clock: () => Date = () => new Date();

export const now = (): Date => clock();

/** Tests only: freeze or move time. */
export function setClock(fn: () => Date): void {
  clock = fn;
}

export function timeScale(): number {
  const s = Number(process.env.DEMO_TIME_SCALE ?? "1");
  if (!Number.isFinite(s) || s < 1) throw new Error("DEMO_TIME_SCALE must be a number >= 1");
  return s;
}

export function afterPolicy(from: Date, key: keyof typeof POLICY_HOURS): Date {
  return new Date(from.getTime() + (POLICY_HOURS[key] * 3_600_000) / timeScale());
}
