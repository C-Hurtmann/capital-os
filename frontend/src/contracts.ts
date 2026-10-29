/** Provisional API schemas. Approval status and semantics: docs/api-contract-proposal.md. */
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
export interface Transaction {
  date: string;
  accountId: string;
  amountMinor: number;
  category: string;
  transfer?: boolean;
}
