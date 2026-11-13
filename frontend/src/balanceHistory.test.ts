import { it, expect, vi, afterEach } from "vitest";
import {
  parseBalanceHistory,
  presetFrom,
  sliceHistory,
  getBalanceHistory,
  kyivDay,
} from "./balanceHistory";
import { historyFixture } from "../tests/historyFixture";
afterEach(() => vi.unstubAllGlobals());
it.each(["1M", "3M", "6M", "12M", "All"] as const)("accepts %s", (preset) =>
  expect(parseBalanceHistory(historyFixture(preset), preset)).toEqual(
    historyFixture(preset),
  ),
);
it("supports empty All and fixed", () => {
  expect(
    parseBalanceHistory(
      { ...historyFixture("All"), from: null, points: [] },
      "All",
    ).from,
  ).toBeNull();
  expect(
    parseBalanceHistory({ ...historyFixture(), points: [] }, "3M").points,
  ).toEqual([]);
});
it("supports leading gap with negative and zero", () => {
  const v = historyFixture("1M", "2026-11-03");
  v.points = [
    { date: "2026-11-01", balanceMinor: null as unknown as number },
    { date: "2026-11-03", balanceMinor: -100 },
  ];
  expect(parseBalanceHistory(v, "1M")).toEqual(v);
  v.points[1].balanceMinor = 0;
  expect(parseBalanceHistory(v, "1M")).toEqual(v);
});
it.each([null, 0.1, "1", Number.MAX_SAFE_INTEGER + 1])(
  "rejects invalid known value %s",
  (balanceMinor) => {
    const v = historyFixture();
    const points = v.points.map((p, i) =>
      i === 1 ? { ...p, balanceMinor } : p,
    );
    expect(() => parseBalanceHistory({ ...v, points }, "3M")).toThrow();
  },
);
it.each([
  "missing",
  "duplicate",
  "reversed",
  "lone-null",
  "late-start",
  "missing-end",
])("rejects %s", (mode) => {
  const v = historyFixture();
  if (mode === "missing") v.points.splice(5, 1);
  if (mode === "duplicate") v.points[1] = v.points[0];
  if (mode === "reversed") v.points.reverse();
  if (mode === "lone-null")
    v.points = [{ date: v.from, balanceMinor: null as unknown as number }];
  if (mode === "late-start") v.points.shift();
  if (mode === "missing-end") v.points.pop();
  expect(() => parseBalanceHistory(v, "3M")).toThrow();
});
it.each([
  { from: null },
  { from: "2026-08-01" },
  { to: "2026-02-30" },
  { currency: "USD" },
  { timeZone: "UTC" },
  { computedAt: "2026-11-12T12:00:00+03:00" },
])("rejects metadata %j", (patch) =>
  expect(() =>
    parseBalanceHistory({ ...historyFixture(), ...patch }, "3M"),
  ).toThrow(),
);
it("empty All cannot have a fabricated from", () =>
  expect(() =>
    parseBalanceHistory({ ...historyFixture("All"), points: [] }, "All"),
  ).toThrow());
it("calendar boundaries use Kyiv across DST and year", () => {
  expect(kyivDay("2026-03-31T21:00:00Z")).toBe("2026-04-01");
  expect(kyivDay("2026-10-31T22:00:00Z")).toBe("2026-11-01");
  expect(presetFrom("3M", "2027-01-01")).toBe("2026-11-01");
});
it("All slices to fixed exactly; fixed cannot fabricate All", () => {
  const all = parseBalanceHistory(historyFixture("All"), "All");
  expect(sliceHistory(all, "All", "3M")).toEqual(historyFixture());
  expect(sliceHistory(historyFixture(), "3M", "All")).toBeUndefined();
});
it("All starting late adds only a sentinel; empty All slices empty", () => {
  const all = {
    ...historyFixture("All"),
    from: "2026-11-12",
    points: [{ date: "2026-11-12", balanceMinor: 0 }],
  };
  expect(sliceHistory(all, "All", "3M")?.points).toEqual([
    { date: "2026-09-01", balanceMinor: null },
    { date: "2026-11-12", balanceMinor: 0 },
  ]);
  expect(
    sliceHistory({ ...all, from: null, points: [] }, "All", "1M"),
  ).toMatchObject({ from: "2026-11-01", points: [] });
});
it("slicing inside leading gap relocates sentinel", () => {
  const v = {
    ...historyFixture(),
    points: [
      { date: "2026-09-01", balanceMinor: null },
      { date: "2026-11-12", balanceMinor: 10 },
    ],
  };
  expect(sliceHistory(v, "3M", "1M")?.points[0]).toEqual({
    date: "2026-11-01",
    balanceMinor: null,
  });
});
it("GET uses preset and cancellation", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(historyFixture())));
  vi.stubGlobal("fetch", fetch);
  const signal = new AbortController().signal;
  await getBalanceHistory("3M", signal);
  expect(fetch).toHaveBeenCalledWith("/api/v1/balance-history?preset=3M", {
    signal,
    headers: { Accept: "application/json" },
  });
});
it.each([422, 500, 503])("error %s is not an empty history", async (status) => {
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
    getBalanceHistory("3M", new AbortController().signal),
  ).rejects.toThrow(`HTTP ${status}`);
});
