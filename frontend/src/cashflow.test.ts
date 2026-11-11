import { afterEach, expect, it, vi } from "vitest";
import { parseCashflow, getCashflow } from "./cashflow";
const valid = {
  from: "2026-11-01",
  to: "2026-11-11",
  timeZone: "Europe/Kyiv",
  currency: "UAH",
  incomeMinor: 1147253,
  expenseMinor: 3873988,
  netMinor: -2726735,
  computedAt: "2026-11-11T12:21:05.534000Z",
};
afterEach(() => vi.unstubAllGlobals());
it.each([
  [0, 0, 0],
  [100, 0, 100],
  [0, 100, -100],
  [100, 100, 0],
  [Number.MAX_SAFE_INTEGER, 0, Number.MAX_SAFE_INTEGER],
  [0, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER],
])(
  "valid totals %j %j %j without coverage",
  (incomeMinor, expenseMinor, netMinor) => {
    const data = { ...valid, incomeMinor, expenseMinor, netMinor };
    expect(parseCashflow(data)).toEqual(data);
  },
);
it.each([
  { incomeMinor: null },
  { expenseMinor: -1 },
  { netMinor: 0 },
  { incomeMinor: "100" },
  { incomeMinor: 0.1 },
  { incomeMinor: Number.MAX_SAFE_INTEGER + 1 },
  { currency: "USD" },
  { timeZone: "UTC" },
  { from: "2026-11-02" },
  { to: "2026-02-30" },
  { computedAt: "2026-11-11T12:21:05+03:00" },
  { computedAt: "2026-02-30T12:00:00Z" },
  { to: "2026-11-12" },
])("rejects invalid fields %j", (patch) =>
  expect(() => parseCashflow({ ...valid, ...patch })).toThrow(),
);
it.each([
  ["2026-10-31T22:00:00Z", "2026-11-01", "2026-11-01"],
  ["2026-03-31T21:00:00Z", "2026-04-01", "2026-04-01"],
  ["2026-12-31T22:00:00Z", "2027-01-01", "2027-01-01"],
  ["2026-03-29T01:30:00Z", "2026-03-01", "2026-03-29"],
])("uses Kyiv cutoff %s", (computedAt, from, to) =>
  expect(parseCashflow({ ...valid, computedAt, from, to })).toMatchObject({
    computedAt,
    from,
    to,
  }),
);
it("relative GET passes signal and validates response", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(valid)));
  vi.stubGlobal("fetch", fetch);
  const signal = new AbortController().signal;
  expect(await getCashflow(signal)).toEqual(valid);
  expect(fetch).toHaveBeenCalledWith("/api/v1/cashflow/current", {
    signal,
    headers: { Accept: "application/json" },
  });
});
it.each([500, 503, 502])(
  "handles HTTP %s without leaking body",
  async (status) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ detail: "private", requestId: "req-123" }),
            { status, headers: { "Content-Type": "application/problem+json" } },
          ),
        ),
    );
    await expect(getCashflow(new AbortController().signal)).rejects.toThrow(
      `Could not load cashflow (HTTP ${status}). Reference: req-123.`,
    );
  },
);
