import { describe, expect, it } from "vitest";
import { aggregate, validateQuery, transactions } from "./data";
import { change } from "./format";
const q = { from: "2026-10-01", to: "2026-10-29", currency: "UAH" };
describe("financial semantics", () => {
  it("reconciles timeline, cashflow and category totals across all accounts", () => {
    const d = aggregate(q);
    expect(d.timeline.at(-1)?.balanceMinor).toBe(
      d.overview.closingBalanceMinor,
    );
    expect(
      d.overview.closingBalanceMinor - d.overview.openingBalanceMinor,
    ).toBe(d.overview.incomeMinor - d.overview.expenseMinor);
    expect(d.categories.reduce((s, c) => s + c.amountMinor, 0)).toBe(
      d.overview.expenseMinor,
    );
    expect(d.months.reduce((s, m) => s + m.incomeMinor, 0)).toBe(
      d.overview.incomeMinor,
    );
  });
  it("includes transfers in account balance, excludes them from cashflow", () => {
    const d = aggregate({
      ...q,
      from: "2026-10-12",
      to: "2026-10-12",
      accountId: "black",
    });
    expect(
      d.overview.closingBalanceMinor - d.overview.openingBalanceMinor,
    ).toBe(d.overview.incomeMinor - d.overview.expenseMinor - 400000);
  });
  it("combines accounts without changing totals", () => {
    const all = aggregate(q),
      a = aggregate({ ...q, accountId: "black" }),
      b = aggregate({ ...q, accountId: "white" });
    expect(all.overview.currentBalanceMinor).toBe(
      a.overview.currentBalanceMinor + b.overview.currentBalanceMinor,
    );
    expect(all.overview.expenseMinor).toBe(
      a.overview.expenseMinor + b.overview.expenseMinor,
    );
  });
  it("keeps closing balance on days without transactions", () => {
    const d = aggregate({ ...q, from: "2025-12-01", to: "2025-12-05" });
    expect(d.overview.expenseMinor).toBe(0);
    expect(d.timeline).toHaveLength(5);
    expect(new Set(d.timeline.map((t) => t.balanceMinor)).size).toBe(1);
  });
  it("handles partial months and year boundaries", () => {
    expect(
      aggregate({ ...q, from: "2025-12-31", to: "2026-02-03" }).months.map(
        (m) => m.month,
      ),
    ).toEqual(["2025-12", "2026-01", "2026-02"]);
  });
  it("rejects invalid dates, reversed or oversized ranges and mixed currencies", () => {
    for (const p of [
      { from: "2026-02-30" },
      { from: "2026-11-01" },
      { from: "2024-01-01" },
      { currency: "USD" },
      { accountId: "missing" },
    ])
      expect(() => validateQuery({ ...q, ...p })).toThrow();
  });
  it("avoids percentages against a zero baseline", () => {
    expect(change(100, 0)).toBe("Немає бази порівняння");
    expect(change(0, 0)).toBe("Без змін");
  });
});

// Approved domain fixtures retain account movement and original foreign amount separately.
it("preserves unique bank IDs, post-operation balances and foreign source amounts", () => {
  expect(new Set(transactions.map((t) => t.bankId)).size).toBe(
    transactions.length,
  );
  const balances: Record<string, number> = { black: 4820000, white: 1200000 };
  for (const t of transactions) {
    balances[t.accountId] += t.amountMinor;
    expect(t.balanceMinor).toBe(balances[t.accountId]);
    expect(Number.isSafeInteger(t.amountMinor)).toBe(true);
    expect(Number.isSafeInteger(t.operationAmountMinor)).toBe(true);
    expect(Number.isNaN(Date.parse(t.timestamp))).toBe(false);
  }
  expect(
    transactions.some(
      (t) =>
        t.operationCurrencyCode === 978 &&
        t.operationAmountMinor !== t.amountMinor,
    ),
  ).toBe(true);
});
