import { describe, expect, it } from "vitest";
import { type AiCheck, computeReasons, type FlagInput } from "@/server/decision/flagging";

const base: FlagInput = {
  isNewPayee: false,
  amountMinor: 1000,
  thresholdMinor: 20000,
  payerUnsure: false,
  textPresent: false,
  ai: { status: "NOT_RUN" },
};

describe("required test 1: flagging boundary", () => {
  it("does not flag exactly €200.00 by amount", () => {
    expect(computeReasons({ ...base, amountMinor: 20000 })).not.toContain("OVER_THRESHOLD");
  });
  it("flags €200.01", () => {
    expect(computeReasons({ ...base, amountMinor: 20001 })).toContain("OVER_THRESHOLD");
  });
});

describe("required test 4 (pure part): the AI is one-way", () => {
  const aiResults: AiCheck[] = [
    { status: "NOT_RUN" },
    { status: "NO_MATCH" },
    { status: "MATCH", pattern: "EMERGENCY_OR_BAIL", evidence: "asks for bail money urgently" },
    { status: "UNAVAILABLE" },
  ];

  it("never removes a deterministic reason, for every input combination", () => {
    for (const isNewPayee of [false, true])
      for (const amountMinor of [20000, 20001])
        for (const payerUnsure of [false, true])
          for (const textPresent of [false, true]) {
            const det = computeReasons({ ...base, isNewPayee, amountMinor, payerUnsure, textPresent: false });
            for (const ai of aiResults) {
              const all = computeReasons({ ...base, isNewPayee, amountMinor, payerUnsure, textPresent, ai });
              expect(all).toEqual(expect.arrayContaining(det));
            }
          }
  });

  it("match:false keeps the deterministic hold", () => {
    expect(computeReasons({ ...base, isNewPayee: true, textPresent: true, ai: { status: "NO_MATCH" } })).toEqual([
      "NEW_PAYEE",
    ]);
  });

  it("a match adds AI_SCAM_PATTERN on its own", () => {
    const ai: AiCheck = { status: "MATCH", pattern: "EMERGENCY_OR_BAIL", evidence: "bail" };
    expect(computeReasons({ ...base, textPresent: true, ai })).toEqual(["AI_SCAM_PATTERN"]);
  });

  it("an unavailable check (timeout/error) with text present holds the send", () => {
    expect(computeReasons({ ...base, textPresent: true, ai: { status: "UNAVAILABLE" } })).toEqual([
      "AI_CHECK_UNAVAILABLE",
    ]);
  });

  it("text present but no AI result fails closed", () => {
    expect(computeReasons({ ...base, textPresent: true })).toEqual(["AI_CHECK_UNAVAILABLE"]);
  });

  it("no text and nothing else: not flagged", () => {
    expect(computeReasons(base)).toEqual([]);
  });
});
