/** Integer minor units → PayPal amount string, e.g. 1000 → "10.00". No float math. */
export function minorToValue(minor: number): string {
  if (!Number.isSafeInteger(minor) || minor <= 0) throw new Error(`invalid minor amount: ${minor}`);
  return `${Math.trunc(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
}
