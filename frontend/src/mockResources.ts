/** Synthetic service boundary. Calendar choices below are fixtures, not production rules. */
import { aggregate, DEMO_TODAY } from "./data";
import type {
  BalanceResponse,
  CashflowResponse,
  HistoryPreset,
  HistoryView,
  MonthlyView,
  SpendingView,
  CreditLimitResponse,
} from "./contracts";
import { parseCreditLimit, getCreditLimit } from "./creditLimit";
import { getCashflow } from "./cashflow";
export const liveCashflow = import.meta.env.VITE_CASHFLOW_SOURCE === "api";
import { getBalance } from "./balance";
export const liveBalance = import.meta.env.VITE_BALANCE_SOURCE === "api";
const currentQuery = { from: "2026-10-01", to: DEMO_TODAY, currency: "UAH" };
const ranges: Record<HistoryPreset, string> = {
  "1M": "2026-10-01",
  "3M": "2026-08-01",
  "6M": "2026-05-01",
  "12M": "2025-10-30",
  All: "2025-01-01",
};
function meta(from: string) {
  return {
    from,
    to: DEMO_TODAY,
    asOf: "2026-10-29T18:30:00Z",
    coverage: "complete" as const,
    timeZone: "Europe/Kyiv" as const,
  };
}
async function mock<T>(signal: AbortSignal, read: () => T): Promise<T> {
  await new Promise<void>((resolve) => setTimeout(resolve, 150));
  signal.throwIfAborted();
  if (!navigator.onLine)
    throw new Error("Could not refresh. Previous data is retained.");
  return read();
}
export const loadBalance = (signal: AbortSignal): Promise<BalanceResponse> =>
  liveBalance
    ? getBalance(signal)
    : mock(signal, () => ({
        bankBalanceMinor: aggregate(currentQuery).overview.currentBalanceMinor,
        ownFundsMinor: null,
        creditUsedMinor: null,
        fetchedAt: meta(currentQuery.from).asOf,
      }));
export const loadCashflow = (signal: AbortSignal): Promise<CashflowResponse> =>
  liveCashflow
    ? getCashflow(signal)
    : mock(signal, () => {
        const o = aggregate(currentQuery).overview;
        return {
          from: currentQuery.from,
          to: currentQuery.to,
          timeZone: "Europe/Kyiv",
          currency: "UAH",
          computedAt: meta(currentQuery.from).asOf,
          incomeMinor: o.incomeMinor,
          expenseMinor: o.expenseMinor,
          netMinor: o.incomeMinor - o.expenseMinor,
        };
      });
export const loadSpending = (signal: AbortSignal): Promise<SpendingView> =>
  mock(signal, () => {
    const d = aggregate(currentQuery);
    return {
      ...meta(currentQuery.from),
      totalMinor: d.overview.expenseMinor,
      categories: d.categories,
    };
  });
export const loadMonthly = (signal: AbortSignal): Promise<MonthlyView> =>
  mock(signal, () => ({
    ...meta("2025-11-01"),
    months: aggregate({ ...currentQuery, from: "2025-11-01" }).months,
  }));
export const loadHistory = (
  preset: HistoryPreset,
  signal: AbortSignal,
): Promise<HistoryView> =>
  mock(signal, () => ({
    ...meta(ranges[preset]),
    points: aggregate({ ...currentQuery, from: ranges[preset] }).timeline,
  }));
// Opt-in local integration only. Other widgets remain explicitly synthetic.
export const liveCredit = import.meta.env.VITE_CREDIT_LIMIT_SOURCE === "api";
export const loadCredit = (
  signal: AbortSignal,
): Promise<CreditLimitResponse> =>
  liveCredit
    ? getCreditLimit(signal)
    : mock(signal, () => {
        const stored = localStorage.getItem("capital-demo-credit-limit");
        return parseCreditLimit(
          stored === null || stored === ""
            ? { amountMinor: null, effectiveFrom: null }
            : {
                amountMinor: Number(stored),
                effectiveFrom:
                  localStorage.getItem("capital-demo-credit-effective-from") ||
                  "2026-10-29T18:30:00Z",
              },
        );
      });
