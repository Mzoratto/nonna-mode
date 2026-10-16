import { defineConfig } from "drizzle-kit";

// Local: read .env.local. Render/CI: variables come from the environment.
try {
  process.loadEnvFile(".env.local");
} catch {}

const raw = process.env.DATABASE_URL_UNPOOLED;
if (!raw) throw new Error("DATABASE_URL_UNPOOLED is required for migrations (direct, non-pooled)");
const url = new URL(raw);
url.searchParams.set("sslmode", "verify-full"); // same TLS pin as src/server/db/client.ts

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: url.toString() },
});
