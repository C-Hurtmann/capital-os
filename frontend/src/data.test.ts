import { describe, expect, it } from "vitest";
import {
  aggregate,
  checkedAdd,
  transactions,
  OPENING_BALANCE,
  validateQuery,
} from "./data";
const q = { from: "2026-10-01", to: "2026-10-29", currency: "UAH" };
describe("MVP accounting rules", () => {
  it("counts every positive and negative movement including outgoing transfers", () => {
    const d = aggregate(q);
    expect(
      d.overview.closingBalanceMinor - d.overview.openingBalanceMinor,
    ).toBe(d.overview.incomeMinor - d.overview.expenseMinor);
    const tx = transactions.filter((t) => t.date >= q.from && t.date <= q.to);
    expect(d.overview.expenseMinor).toBe(
      tx
        .filter((t) => t.amountMinor < 0)
        .reduce((s, t) => s - t.amountMinor, 0),
    );
  });
  it("reconciles category and monthly totals", () => {
    const d = aggregate(q);
    expect(d.categories.reduce((s, c) => s + c.amountMinor, 0)).toBe(
      d.overview.expenseMinor,
    );
    expect(d.months.reduce((s, m) => s + m.incomeMinor, 0)).toBe(
      d.overview.incomeMinor,
    );
  });
  it("supports all history since January 2025 without inventing older values", () => {
    expect(
      aggregate({ ...q, from: "2025-01-01" }).timeline.length,
    ).toBeGreaterThan(366);
    expect(() => aggregate({ ...q, from: "2024-12-31" })).toThrow();
  });
  it("preserves unique IDs, bank MCC and post-operation integer balances", () => {
    let balance = OPENING_BALANCE;
    expect(new Set(transactions.map((t) => t.bankId)).size).toBe(
      transactions.length,
    );
    for (const t of transactions) {
      balance = checkedAdd(balance, t.amountMinor);
      expect(t.balanceMinor).toBe(balance);
      expect(t.mcc).toMatch(/^\d{4}$/);
      expect(Number.isSafeInteger(t.operationAmountMinor)).toBe(true);
    }
    expect(transactions.some((t) => t.operationCurrencyCode === 978)).toBe(
      true,
    );
  });
  it("rejects unsafe monetary sums", () => {
    expect(() => checkedAdd(Number.MAX_SAFE_INTEGER, 1)).toThrow();
    expect(() => checkedAdd(1.1, 2)).toThrow();
  });
  it("keeps current balance independent of history range", () => {
    expect(aggregate(q).overview.currentBalanceMinor).toBe(
      aggregate({ ...q, from: "2025-01-01" }).overview.currentBalanceMinor,
    );
  });
  it("validates dates and account scope", () => {
    for (const change of [
      { from: "2026-02-30" },
      { from: "2026-11-01" },
      { currency: "USD" },
      { accountId: "white" },
    ])
      expect(() => validateQuery({ ...q, ...change })).toThrow();
  });
});
