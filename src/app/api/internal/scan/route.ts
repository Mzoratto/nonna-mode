import { timingSafeEqual } from "node:crypto";
import { runScan } from "@/server/decision/scan";

export const dynamic = "force-dynamic";

// Called by the Trigger.dev schedule (src/trigger/scan.ts). Bearer SCAN_SECRET.
export async function POST(request: Request) {
  const secret = process.env.SCAN_SECRET;
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (!secret || got.length !== want.length || !timingSafeEqual(got, want)) {
    return new Response(null, { status: 401 });
  }
  const result = await runScan();
  console.log("[scan] scheduled", JSON.stringify(result));
  return Response.json(result);
}
