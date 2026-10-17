import { defineConfig } from "drizzle-kit";
import { strictTls } from "./src/server/db/tls";

// Local: read .env.local. Render/CI: variables come from the environment.
try {
  process.loadEnvFile(".env.local");
} catch {}

// Neon: migrate over the direct (non-pooled) URL. A plain Postgres has only DATABASE_URL.
const raw = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!raw) throw new Error("Set DATABASE_URL (and DATABASE_URL_UNPOOLED on Neon) to run migrations");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: strictTls(raw) },
});
