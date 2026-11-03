/** Synthetic demo models only. NOT REST API contracts. */
export interface Account {
  id: string;
  name: string;
  currency: string;
  balanceMinor: number;
}
export interface DashboardQuery {
  from: string;
  to: string;
  currency: string;
  accountId?: string;
}
export interface Dashboard {
  currency: string;
  minorUnit: number;
  from: string;
  to: string;
  asOf: string;
  accounts: Account[];
  overview: {
    currentBalanceMinor: number;
    openingBalanceMinor: number;
    closingBalanceMinor: number;
    incomeMinor: number;
    expenseMinor: number;
    previousIncomeMinor: number;
    previousExpenseMinor: number;
  };
  timeline: { date: string; balanceMinor: number }[];
  categories: {
    id: string;
    label: string;
    mccCodes: string[];
    amountMinor: number;
  }[];
  months: { month: string; incomeMinor: number; expenseMinor: number }[];
}
/** Approved domain semantics; not an approved REST resource. */
export interface Transaction {
  mcc: string; // original bank MCC, never overwritten by category edits
  bankId: string;
  timestamp: string; // RFC3339 instant in this frontend model
  operationAmountMinor: number;
  operationCurrencyCode: number; // numeric ISO 4217
  balanceMinor: number; // account balance immediately after this operation
  date: string;
  accountId: string;
  amountMinor: number;
  category: string;
  transfer?: boolean;
}

/** Approved successful GET /api/v1/credit-limit response. */
export type CreditLimitResponse =
  | { amountMinor: number; effectiveFrom: string }
  | { amountMinor: null; effectiveFrom: null };
export type HistoryPreset = "1M" | "3M" | "6M" | "12M" | "All";
/** Widget view models; provisional until each analytics DTO is agreed. */
export interface PeriodMeta {
  from: string;
  to: string;
  asOf: string;
  coverage: "complete" | "partial" | "unavailable";
  timeZone: "Europe/Kyiv";
}
export interface BalanceView {
  amountMinor: number | null;
  asOf: string;
}
export interface CashflowView extends PeriodMeta {
  incomeMinor: number | null;
  expenseMinor: number | null;
  netMinor: number | null;
}
export interface HistoryView extends PeriodMeta {
  points: { date: string; balanceMinor: number | null }[];
}
export interface SpendingView extends PeriodMeta {
  totalMinor: number | null;
  categories: Dashboard["categories"];
}
export interface MonthlyView extends PeriodMeta {
  months: {
    month: string;
    incomeMinor: number | null;
    expenseMinor: number | null;
  }[];
}
