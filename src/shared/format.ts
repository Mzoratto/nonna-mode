// The only place money and dates are formatted for display.
const eurWhole = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eurCents = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });

/** €2,000 for whole euros (as in the comps), €45.50 otherwise. */
export const formatEur = (minor: number) => (minor % 100 === 0 ? eurWhole : eurCents).format(minor / 100);

/** "Sat 18 Oct, 09:04" in the payer's timezone. */
export function formatWhen(d: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone,
  }).formatToParts(d);
  const v = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${v("weekday")} ${v("day")} ${v("month")}, ${v("hour")}:${v("minute")}`;
}
