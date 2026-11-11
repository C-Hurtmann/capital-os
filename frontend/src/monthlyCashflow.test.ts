import { it, expect, vi, afterEach } from "vitest";
import { parseMonthlyCashflow, getMonthlyCashflow } from "./monthlyCashflow";
import { monthlyFixture as sample } from "../tests/monthlyFixture";
afterEach(() => vi.unstubAllGlobals());
it("accepts 12 zero months without coverage", () =>
  expect(parseMonthlyCashflow(sample)).toEqual(sample));
it("preserves exact largest safe amount and empty middle bucket", () => {
  const value = structuredClone(sample);
  value.months[0].incomeMinor = Number.MAX_SAFE_INTEGER;
  value.months[11].expenseMinor = 123;
  expect(parseMonthlyCashflow(value)).toEqual(value);
});
it.each([11, 13])("rejects %s buckets", (n) =>
  expect(() =>
    parseMonthlyCashflow({
      ...sample,
      months: Array.from({ length: n }, (_, i) => sample.months[i % 12]),
    }),
  ).toThrow(),
);
it.each([null, -1, 0.1, "0", Number.MAX_SAFE_INTEGER + 1])(
  "rejects invalid amount %s",
  (incomeMinor) => {
    const months = sample.months.map((m, i) =>
      i === 2 ? { ...m, incomeMinor } : m,
    );
    expect(() => parseMonthlyCashflow({ ...sample, months })).toThrow();
  },
);
it.each(["2026-00", "2026-13", "2026-11", "2025-12"])(
  "rejects invalid/duplicate/out of order month %s",
  (month) => {
    const months = sample.months.map((m, i) => (i === 2 ? { ...m, month } : m));
    expect(() => parseMonthlyCashflow({ ...sample, months })).toThrow();
  },
);
it.each([
  { from: "2025-11-01" },
  { to: "2026-11-12" },
  { to: "2026-02-30" },
  { computedAt: "2026-02-30T12:00:00Z" },
  { computedAt: "2026-11-11T12:00:00+03:00" },
  { currency: "EUR" },
  { timeZone: "UTC" },
])("rejects invalid metadata %j", (patch) =>
  expect(() => parseMonthlyCashflow({ ...sample, ...patch })).toThrow(),
);
it.each([
  "2026-03-31T21:00:00Z",
  "2026-10-31T22:00:00Z",
  "2026-12-31T22:00:00Z",
])("Kyiv rollover %s", (computedAt) => {
  const localMonth = computedAt.startsWith("2026-03")
    ? "2026-04"
    : computedAt.startsWith("2026-10")
      ? "2026-11"
      : "2027-01";
  const [y, m] = localMonth.split("-").map(Number);
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 12 + i, 1));
    return {
      month: d.toISOString().slice(0, 7),
      incomeMinor: 0,
      expenseMinor: 0,
    };
  });
  const value = {
    ...sample,
    computedAt,
    to: localMonth + "-01",
    from: months[0].month + "-01",
    months,
  };
  expect(parseMonthlyCashflow(value)).toEqual(value);
});
it("uses relative GET and signal", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(sample)));
  vi.stubGlobal("fetch", fetch);
  const signal = new AbortController().signal;
  expect(await getMonthlyCashflow(signal)).toEqual(sample);
  expect(fetch).toHaveBeenCalledWith("/api/v1/cashflow/monthly", {
    signal,
    headers: { Accept: "application/json" },
  });
});
it.each([500, 503])("handles %s Problem Details", async (status) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ requestId: "req-1" }), {
        status,
        headers: { "Content-Type": "application/problem+json" },
      }),
    ),
  );
  await expect(
    getMonthlyCashflow(new AbortController().signal),
  ).rejects.toThrow(`HTTP ${status}`);
});
