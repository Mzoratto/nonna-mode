// Runs before every test file: point the app's DB client at the Neon *test* branch.
try {
  process.loadEnvFile(".env.local");
} catch {}

// Tests never call real third parties: AI checks/wording fall back unless a test injects a fake.
// Same for every email setting from .env.local, so tests never depend on the developer's inbox.
for (const k of ["OPENAI_API_KEY", "RESEND_API_KEY", "EMAIL_FROM", "DEMO_EMAIL_OVERRIDE"]) delete process.env[k];

const testUrl = process.env.DATABASE_URL_TEST;
if (testUrl) {
  const host = (u?: string) => (u ? new URL(u).hostname.split(".")[0]?.replace("-pooler", "") : undefined);
  if (host(testUrl) === host(process.env.DATABASE_URL) || host(testUrl) === host(process.env.DATABASE_URL_UNPOOLED)) {
    throw new Error("DATABASE_URL_TEST points at the app database; refusing to run destructive tests");
  }
  process.env.DATABASE_URL = testUrl;
}
