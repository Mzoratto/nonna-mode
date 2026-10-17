// Startup scan: recovers anything a crash or redeploy left half-done.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  if (!process.env.DATABASE_URL) return;
  const { runScan } = await import("@/server/decision/scan");
  runScan()
    .then((r) => console.log("[scan] startup", JSON.stringify(r)))
    .catch((err: unknown) => console.error("[scan] startup failed", err));
}
