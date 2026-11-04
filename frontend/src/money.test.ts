import { describe, expect, it } from "vitest";
import { uahToMinor, minorToUah, formatMinor } from "./money";
describe("exact money conversion", () => {
  it.each([
    ["0", 0],
    ["0.01", 1],
    ["1.10", 110],
    [" 12,34 ", 1234],
    ["90071992547409.91", Number.MAX_SAFE_INTEGER],
  ])("round-trips %s", (input, minor) => {
    expect(uahToMinor(input)).toBe(minor);
    expect(uahToMinor(minorToUah(minor))).toBe(minor);
  });
  it.each([
    "",
    "-1",
    "1e3",
    "1.234",
    "1,234.56",
    "NaN",
    "Infinity",
    "90071992547409.92",
  ])("rejects %s", (input) => expect(() => uahToMinor(input)).toThrow());
  it("formats safe-integer extremes and negative cents exactly", () => {
    expect(formatMinor(Number.MAX_SAFE_INTEGER)).toContain(
      "90,071,992,547,409.91",
    );
    expect(formatMinor(-Number.MAX_SAFE_INTEGER)).toContain("-UAH");
    expect(formatMinor(-1)).toContain("0.01");
    expect(formatMinor(-1)).toContain("-");
    expect(formatMinor(null)).toBe("Unavailable");
  });
});
