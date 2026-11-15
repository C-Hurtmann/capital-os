import { describe, it, expect, vi, afterEach } from "vitest";
import {
  emptyFilters,
  parseTransactions,
  transactionMoney,
  validateTransactionFilters,
  validateTransactionOrder,
  getTransactions,
} from "./transactionsApi";
const item = {
  bankId: "b",
  occurredAt: "2026-11-14T23:30:00Z",
  amountMinor: -199,
  operationAmountMinor: -2,
  operationCurrencyCode: 392,
  balanceMinor: -100,
  mcc: 5411,
  commissionMinor: 0,
  categoryId: "groceries",
};
const page = {
  computedAt: "2026-11-15T12:00:00Z",
  timeZone: "Europe/Kyiv",
  currency: "UAH",
  items: [item],
  nextCursor: "opaque",
};
afterEach(() => vi.unstubAllGlobals());
describe("transactions contract", () => {
  it("accepts FastAPI zero-padded millisecond UTC timestamps", () => {
    expect(
      parseTransactions({ ...page, computedAt: "2026-11-15T12:00:00.563000Z" })
        .computedAt,
    ).toBe("2026-11-15T12:00:00.563000Z");
  });
  it("accepts exact Kyiv date bounds, foreign amounts and continuation", () => {
    expect(
      parseTransactions(page, {
        from: "2026-11-15",
        to: "2026-11-15",
        direction: "expense",
      }).items[0],
    ).toEqual(item);
    expect(parseTransactions({ ...page, items: [] }).nextCursor).toBe("opaque");
  });
  it.each([0, 100])(
    "accepts neutral/income with null category %s",
    (amountMinor) => {
      expect(
        parseTransactions({
          ...page,
          items: [{ ...item, amountMinor, categoryId: null }],
        }).items,
      ).toHaveLength(1);
    },
  );
  it.each([
    { amountMinor: 1.5 },
    { balanceMinor: Number.MAX_SAFE_INTEGER + 1 },
    { commissionMinor: "0" },
    { categoryId: "new" },
    { operationCurrencyCode: 1000 },
    { mcc: -1 },
    { occurredAt: "2026-02-30T10:00:00Z" },
    { amountMinor: 0 },
  ])("rejects malformed item %s", (change) =>
    expect(() =>
      parseTransactions({ ...page, items: [{ ...item, ...change }] }),
    ).toThrow(),
  );
  it("rejects duplicate and incorrect order across appends", () => {
    expect(() => validateTransactionOrder([item, item])).toThrow();
    expect(() =>
      validateTransactionOrder([item, { ...item, bankId: "c" }]),
    ).toThrow();
    expect(() =>
      validateTransactionOrder([item, { ...item, bankId: "a" }]),
    ).not.toThrow();
  });
  it("rejects invalid metadata and filter mismatch", () => {
    expect(() =>
      parseTransactions({ ...page, computedAt: "2026-02-30T00:00:00Z" }),
    ).toThrow();
    expect(() =>
      parseTransactions(page, { ...emptyFilters, direction: "income" }),
    ).toThrow();
    expect(() => parseTransactions({ ...page, nextCursor: "" })).toThrow();
  });
  it("formats safe boundary and currency exponents exactly", () => {
    expect(transactionMoney(Number.MAX_SAFE_INTEGER)).toBe(
      "90,071,992,547,409.91 UAH",
    );
    expect(transactionMoney(-1)).toBe("−0.01 UAH");
    expect(transactionMoney(-3500, 392)).toBe("−3,500 JPY");
    expect(transactionMoney(1234, 414)).toBe("1.234 KWD");
    expect(transactionMoney(-12999, 999)).toBe(
      "-12,999 minor units · code 999",
    );
    expect(transactionMoney(0, 980, true)).toBe("0.00 UAH");
  });
  it("validates one-sided, reversed, future and impossible dates", () => {
    expect(
      validateTransactionFilters(
        { ...emptyFilters, from: "2026-01-01" },
        "2026-11-15",
      ),
    ).toEqual({});
    for (const q of [
      { ...emptyFilters, to: "2026-02-30" },
      { ...emptyFilters, from: "2026-11-16" },
      { ...emptyFilters, from: "2026-11-15", to: "2026-11-14" },
    ])
      expect(
        Object.keys(validateTransactionFilters(q, "2026-11-15")),
      ).toHaveLength(1);
  });
  it("serializes only contract fields and preserves opaque token", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ...page, items: [] })));
    vi.stubGlobal("fetch", fetcher);
    await getTransactions(
      { ...emptyFilters, from: "2026-01-01", direction: "income" },
      "a+/=",
      new AbortController().signal,
    );
    const url = new URL(fetcher.mock.calls[0][0], "http://test");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      limit: "20",
      from: "2026-01-01",
      direction: "income",
      cursor: "a+/=",
    });
  });
  it("handles infrastructure and Problem Details errors without exposing payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ requestId: "req-12", detail: "internal" }),
          {
            status: 503,
            headers: { "content-type": "application/problem+json" },
          },
        ),
      ),
    );
    await expect(
      getTransactions(emptyFilters, null, new AbortController().signal),
    ).rejects.toThrow("Reference: req-12");
  });
});
