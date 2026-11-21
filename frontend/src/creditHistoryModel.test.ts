import { describe, expect, it } from "vitest";
import {
  changeCreditHistory,
  creditHistoryImpact,
  creditOnDate,
  initialCreditHistory as seed,
} from "./creditHistoryModel";
describe("date-only credit history preview", () => {
  it("distinguishes unknown, zero and inclusive change boundaries", () => {
    const entries = changeCreditHistory(
      seed,
      { id: "zero", startDate: "2026-10-10", amountMinor: 0 },
      false,
      "2026-11-21",
    );
    expect(creditOnDate(entries, "2026-08-31")).toBeUndefined();
    expect(creditOnDate(entries, "2026-10-10")?.amountMinor).toBe(0);
    expect(creditOnDate(entries, "2026-10-15")?.amountMinor).toBe(5000000);
  });
  it("rejects duplicate, future, invalid date and unsafe amount", () => {
    for (const [startDate, amountMinor] of [
      ["2026-10-01", 1],
      ["2026-11-22", 1],
      ["2026-02-30", 1],
      ["2026-11-01", Number.MAX_SAFE_INTEGER + 1],
    ] as const)
      expect(() =>
        changeCreditHistory(
          seed,
          { id: "new", startDate, amountMinor },
          false,
          "2026-11-21",
        ),
      ).toThrow();
  });
  it("requires quick changes to follow the latest record", () => {
    expect(() =>
      changeCreditHistory(
        seed,
        { id: "new", startDate: "2026-10-02", amountMinor: 1 },
        true,
        "2026-11-21",
      ),
    ).toThrow();
  });
  it("reports removal consequences including unknown", () => {
    expect(creditHistoryImpact(seed, seed.slice(1))[0]).toMatchObject({
      startDate: "2026-09-01",
      until: "2026-10-01",
      before: 3000000,
      after: null,
    });
    expect(
      creditHistoryImpact(
        seed,
        seed.filter((e) => e.id !== "demo-2"),
      )[0],
    ).toMatchObject({
      startDate: "2026-10-01",
      until: "2026-10-15",
      before: 4000000,
      after: 3000000,
    });
    expect(creditHistoryImpact(seed, seed.slice(0, 2))[0]).toMatchObject({
      startDate: "2026-10-15",
      until: null,
      after: 4000000,
    });
    expect(creditHistoryImpact(seed.slice(0, 1), [])[0].after).toBeNull();
  });
});
