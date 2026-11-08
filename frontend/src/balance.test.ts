import { afterEach, expect, it, vi } from "vitest";
import { getBalance, parseBalance } from "./balance";
const valid = {
  bankBalanceMinor: 7000000,
  ownFundsMinor: 2000000,
  creditUsedMinor: 0,
  fetchedAt: "2026-11-04T06:00:00Z",
};
afterEach(() => vi.unstubAllGlobals());
it.each([
  valid,
  {
    ...valid,
    bankBalanceMinor: 1000000,
    ownFundsMinor: 0,
    creditUsedMinor: 4000000,
  },
  { ...valid, ownFundsMinor: null, creditUsedMinor: null },
  { ...valid, bankBalanceMinor: -12345 },
  { ...valid, bankBalanceMinor: Number.MAX_SAFE_INTEGER },
])("accepts bank snapshot %j", (value) =>
  expect(parseBalance(value)).toEqual(value),
);
it.each([
  { ...valid, bankBalanceMinor: null },
  { ...valid, bankBalanceMinor: "1" },
  { ...valid, bankBalanceMinor: 0.5 },
  { ...valid, bankBalanceMinor: Number.MAX_SAFE_INTEGER + 1 },
  { ...valid, ownFundsMinor: undefined },
  { ...valid, creditUsedMinor: "0" },
  { ...valid, fetchedAt: "2026-02-30T06:00:00Z" },
  { ...valid, fetchedAt: "2026-11-04T09:00:00+03:00" },
  { ...valid, fetchedAt: "bad" },
])("rejects invalid snapshot %j", (value) =>
  expect(() => parseBalance(value)).toThrow(),
);
it("reads the relative endpoint with cancellation", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(valid)));
  vi.stubGlobal("fetch", fetch);
  const signal = new AbortController().signal;
  expect(await getBalance(signal)).toEqual(valid);
  expect(fetch).toHaveBeenCalledWith("/api/v1/balance", {
    signal,
    headers: { Accept: "application/json" },
  });
});
it("handles 503 Problem Details safely", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ requestId: "balance-123", detail: "private" }),
        {
          status: 503,
          headers: { "Content-Type": "application/problem+json" },
        },
      ),
    ),
  );
  await expect(getBalance(new AbortController().signal)).rejects.toThrow(
    "Could not load balance (HTTP 503). Reference: balance-123.",
  );
});
it("handles non-JSON infrastructure failure", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("private", { status: 502 })),
  );
  await expect(getBalance(new AbortController().signal)).rejects.toThrow(
    "Could not load balance (HTTP 502).",
  );
});
