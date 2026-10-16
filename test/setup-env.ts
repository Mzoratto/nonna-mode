// Runs before every test file: point the app's DB client at the Neon *test* branch.
try {
  process.loadEnvFile(".env.local");
} catch {}

const testUrl = process.env.DATABASE_URL_TEST;
if (testUrl) {
  const host = (u?: string) => (u ? new URL(u).hostname.split(".")[0]?.replace("-pooler", "") : undefined);
  if (host(testUrl) === host(process.env.DATABASE_URL) || host(testUrl) === host(process.env.DATABASE_URL_UNPOOLED)) {
    throw new Error("DATABASE_URL_TEST points at the app database; refusing to run destructive tests");
  }
  process.env.DATABASE_URL = testUrl;
}
