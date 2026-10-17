/** Trim + lowercase. No provider-specific alias rules (code-standards.md). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

type Identity = { emailNormalized: string | null; paypalAccount: string | null };

/**
 * Would approving send money to this contact? Matches normalized email or the
 * configured PayPal account. A payee with no identity at all cannot be checked,
 * and missing data is never proof of eligibility, so it counts as self-dealing.
 */
export function isSelfDealing(contact: Identity, payee: Identity): boolean {
  const pe = payee.emailNormalized ? normalizeEmail(payee.emailNormalized) : null;
  const pp = payee.paypalAccount?.trim() || null;
  if (!pe && !pp) return true;
  const ce = contact.emailNormalized ? normalizeEmail(contact.emailNormalized) : null;
  const cp = contact.paypalAccount?.trim() || null;
  return (pe !== null && pe === ce) || (pp !== null && pp === cp);
}
