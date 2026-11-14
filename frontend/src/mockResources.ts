import { getSpending } from "./spendingApi";
export const liveSpending = import.meta.env.VITE_SPENDING_SOURCE === "api";
import { demoSpendingCategories } from "./spending";
/** Synthetic service boundary. Calendar choices below are fixtures, not production rules. */
import { aggregate, DEMO_TODAY } from "./data";
import type {
  BalanceResponse,
  CashflowResponse,
  HistoryPreset,
  BalanceHistoryResponse,
  MonthlyCashflowResponse,
  SpendingResponse,
  CreditLimitResponse,
} from "./contracts";
import { parseCreditLimit, getCreditLimit } from "./creditLimit";
import { getMonthlyCashflow } from "./monthlyCashflow";
export const liveMonthly =
  import.meta.env.VITE_MONTHLY_CASHFLOW_SOURCE === "api";
import { getCashflow } from "./cashflow";
export const liveCashflow = import.meta.env.VITE_CASHFLOW_SOURCE === "api";
import { getBalanceHistory, presetFrom } from "./balanceHistory";
export const liveHistory = import.meta.env.VITE_HISTORY_SOURCE === "api";
import { getBalance } from "./balance";
export const liveBalance = import.meta.env.VITE_BALANCE_SOURCE === "api";
const currentQuery = { from: "2026-10-01", to: DEMO_TODAY, currency: "UAH" };
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
export const loadSpending = (signal: AbortSignal): Promise<SpendingResponse> =>
  liveSpending
    ? getSpending(signal)
    : mock(signal, () => {
        // Display-only fixture distribution, not a bank MCC mapping. Keep the
        // demo expense total consistent with the existing current-month fixture.
        const totalMinor = aggregate(currentQuery).overview.expenseMinor;
        const weight = demoSpendingCategories.reduce(
          (sum, c) => sum + BigInt(c.amountMinor),
          0n,
        );
        const categories = demoSpendingCategories.map((c) => ({
          id: c.id,
          amountMinor: Number(
            (BigInt(totalMinor) * BigInt(c.amountMinor)) / weight,
          ),
        }));
        categories[0].amountMinor +=
          totalMinor - categories.reduce((sum, c) => sum + c.amountMinor, 0);
        return {
          from: currentQuery.from,
          to: currentQuery.to,
          computedAt: meta(currentQuery.from).asOf,
          currency: "UAH",
          timeZone: "Europe/Kyiv",
          totalMinor,
          categories: categories
            .filter((c) => c.amountMinor > 0)
            .sort(
              (a, b) =>
                b.amountMinor - a.amountMinor || a.id.localeCompare(b.id),
            ),
        };
      });
export const loadMonthly = (
  signal: AbortSignal,
): Promise<MonthlyCashflowResponse> =>
  liveMonthly
    ? getMonthlyCashflow(signal)
    : mock(signal, () => ({
        from: "2025-11-01",
        to: DEMO_TODAY,
        timeZone: "Europe/Kyiv",
        currency: "UAH",
        computedAt: meta("2025-11-01").asOf,
        months: aggregate({ ...currentQuery, from: "2025-11-01" }).months,
      }));
export const loadHistory = (
  preset: HistoryPreset,
  signal: AbortSignal,
): Promise<BalanceHistoryResponse> =>
  liveHistory
    ? getBalanceHistory(preset, signal)
    : mock(signal, () => {
        const from =
          preset === "All" ? "2025-01-01" : presetFrom(preset, DEMO_TODAY);
        return {
          from,
          to: DEMO_TODAY,
          timeZone: "Europe/Kyiv",
          currency: "UAH",
          computedAt: meta(from).asOf,
          points: aggregate({ ...currentQuery, from }).timeline,
        };
      });
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
