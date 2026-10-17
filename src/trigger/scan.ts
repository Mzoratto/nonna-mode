import { logger, schedules } from "@trigger.dev/sdk";

// The single durable background runner. It holds no payment policy and no
// PayPal/DB secrets: it only asks the app to run its idempotent recovery scan.
// Every minute (not 5): expiry lags by at most one interval, and the
// DEMO_TIME_SCALE=360 recording needs 1-minute granularity anyway.
export const recoveryScan = schedules.task({
  id: "recovery-scan",
  cron: "* * * * *",
  maxDuration: 120,
  run: async () => {
    const base = process.env.APP_BASE_URL;
    const secret = process.env.SCAN_SECRET;
    if (!base || !secret) throw new Error("APP_BASE_URL and SCAN_SECRET must be set in the Trigger.dev environment");
    const res = await fetch(`${base}/api/internal/scan`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(90_000), // covers a Render cold start
    });
    if (!res.ok) throw new Error(`scan endpoint returned ${res.status}`); // Trigger.dev retries
    const result: unknown = await res.json();
    logger.log("scan result", { result });
    return result;
  },
});
