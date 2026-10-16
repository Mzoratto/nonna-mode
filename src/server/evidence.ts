import "server-only";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

// ponytail: phase-0 raw evidence as local JSONL (gitignored); replaced by WebhookEvent/AuditEvent rows in phase 1.
const DIR = path.join(process.cwd(), "evidence", "raw");

export async function appendEvidence(file: "proof" | "webhooks", entry: Record<string, unknown>) {
  await mkdir(DIR, { recursive: true });
  await appendFile(path.join(DIR, `${file}.jsonl`), JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
}
