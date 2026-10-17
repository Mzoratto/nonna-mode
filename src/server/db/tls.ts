/**
 * Pin full certificate verification where TLS is requested. pg v9 will weaken
 * require/prefer/verify-ca to libpq semantics, so those become verify-full.
 * URLs without TLS (a local Postgres for self-hosting) are left unchanged.
 */
export function strictTls(url: string): string {
  const u = new URL(url);
  const mode = u.searchParams.get("sslmode");
  if (mode === "require" || mode === "prefer" || mode === "verify-ca") u.searchParams.set("sslmode", "verify-full");
  return u.toString();
}
