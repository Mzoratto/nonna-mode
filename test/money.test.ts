import { describe, expect, it } from "vitest";
import { minorToValue, parseEurToMinor } from "@/server/money";

describe("parseEurToMinor", () => {
  it.each([
    ["200", 20000],
    ["200.01", 20001],
    ["200,5", 20050],
    [" 0.01 ", 1],
    ["100000", 10000000],
  ])("%s → %d", (input, minor) => expect(parseEurToMinor(input)).toBe(minor));

  it.each(["", "0", "0.00", "1.234", "1,000.00", "-5", "1e3", "100000.01", "abc", "12.", ".5"])(
    "rejects %j",
    (input) => expect(parseEurToMinor(input)).toBeNull(),
  );

  it("round-trips through minorToValue", () => {
    expect(minorToValue(parseEurToMinor("200,5")!)).toBe("200.50");
  });
});
