/** Integer minor units → PayPal amount string, e.g. 1000 → "10.00". No float math. */
export function minorToValue(minor: number): string {
  if (!Number.isSafeInteger(minor) || minor <= 0) throw new Error(`invalid minor amount: ${minor}`);
  return `${Math.trunc(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
}

/**
 * User-typed euros → minor units, without floats. Accepts "200", "200.5", "200,50"
 * (comma is the decimal mark for most of our users). Rejects thousands
 * separators, signs, more than 2 decimals, zero, and amounts above €100,000.
 */
export function parseEurToMinor(input: string): number | null {
  const m = /^(\d{1,6})(?:[.,](\d{1,2}))?$/.exec(input.trim());
  if (!m) return null;
  const minor = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return minor > 0 && minor <= 10_000_000 ? minor : null;
}
