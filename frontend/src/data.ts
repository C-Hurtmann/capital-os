import type { Dashboard, DashboardQuery, Transaction } from "./contracts";
export const DEMO_TODAY = "2026-10-29";
export const labels: Record<string, string> = {
  groceries: "Groceries",
  dining: "Dining",
  shopping: "Shopping",
  transport: "Transport",
  home: "Home & utilities",
  other: "Other",
  credit: "Credit",
  salary: "Income",
};
const categoryMcc: Record<string, string[]> = {
  groceries: ["5411"],
  dining: ["5812", "5814"],
  shopping: ["5311"],
  transport: ["4111", "5541"],
  home: ["4900"],
  other: ["5999"],
  credit: ["4829"],
  salary: ["0000"],
};
export const accounts = [
  { id: "black", name: "Monobank", currency: "UAH", balanceMinor: 0 },
];
export const OPENING_BALANCE = 4820000;
export const transactions: Transaction[] = [];
let balance = OPENING_BALANCE;
function add(date: string, amountMinor: number, category: string) {
  balance = checkedAdd(balance, amountMinor);
  const index = transactions.length;
  const foreign = amountMinor < 0 && category !== "credit" && index % 7 === 0;
  transactions.push({
    bankId: `mock-bank-${index + 1}`,
    timestamp: `${date}T12:00:${String(index % 60).padStart(2, "0")}Z`,
    date,
    accountId: "black",
    amountMinor,
    category,
    mcc: categoryMcc[category][0],
    operationAmountMinor: foreign ? -(499 + (index % 2000)) : amountMinor,
    operationCurrencyCode: foreign ? 978 : 980,
    balanceMinor: balance,
  });
}
for (
  let d = Date.parse("2025-01-01"), i = 0;
  d <= Date.parse(DEMO_TODAY);
  d += 86400000, i++
) {
  const date = new Date(d).toISOString().slice(0, 10),
    day = new Date(d).getUTCDate();
  if (day === 5 || day === 20)
    add(date, day === 5 ? 2400000 : 1600000, "salary");
  add(date, -(18000 + ((i * 7919) % 165000)), Object.keys(labels)[i % 6]);
  if (day === 12) add(date, -400000, "credit");
}
export function checkedAdd(a: number, b: number): number {
  if (
    !Number.isSafeInteger(a) ||
    !Number.isSafeInteger(b) ||
    !Number.isSafeInteger(a + b)
  )
    throw new Error("Amount exceeds the supported integer range.");
  return a + b;
}
const overridesKey = "capital-demo-category-overrides";
export function effectiveCategory(t: Transaction): string {
  try {
    const saved = JSON.parse(localStorage.getItem(overridesKey) || "{}");
    return typeof saved[t.bankId] === "string" && saved[t.bankId] in labels
      ? saved[t.bankId]
      : t.category;
  } catch {
    return t.category;
  }
}
export function saveCategory(bankId: string, category: string) {
  if (!(category in labels) || !transactions.some((t) => t.bankId === bankId))
    throw new Error("Invalid category or transaction.");
  const saved = JSON.parse(localStorage.getItem(overridesKey) || "{}");
  localStorage.setItem(
    overridesKey,
    JSON.stringify({ ...saved, [bankId]: category }),
  );
  window.dispatchEvent(new Event("capital-category-change"));
}
export function validateQuery(q: DashboardQuery) {
  const valid = (s: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s;
  if (!valid(q.from) || !valid(q.to) || q.from > q.to)
    throw new Error("Choose a valid date range.");
  if (q.from < "2025-01-01")
    throw new Error("History before January 2025 is unavailable.");
  if (q.to > DEMO_TODAY)
    throw new Error("Choose dates up to the demo snapshot.");
  if (q.currency !== "UAH" || (q.accountId && q.accountId !== "black"))
    throw new Error("Only the main UAH account is available.");
}
export function aggregate(q: DashboardQuery): Dashboard {
  validateQuery(q);
  const range = transactions.filter((t) => t.date >= q.from && t.date <= q.to);
  const sum = (items: Transaction[], income: boolean) =>
    items
      .filter((t) => (income ? t.amountMinor > 0 : t.amountMinor < 0))
      .reduce((s, t) => checkedAdd(s, Math.abs(t.amountMinor)), 0);
  const balanceAt = (date: string, inclusive = true) =>
    transactions
      .filter((t) => (inclusive ? t.date <= date : t.date < date))
      .at(-1)?.balanceMinor ?? OPENING_BALANCE;
  const length = Date.parse(q.to) - Date.parse(q.from) + 86400000;
  const prev = new Date(Date.parse(q.from) - length).toISOString().slice(0, 10);
  const previous = transactions.filter(
    (t) => t.date >= prev && t.date < q.from,
  );
  const timeline = [];
  for (let d = Date.parse(q.from); d <= Date.parse(q.to); d += 86400000) {
    const date = new Date(d).toISOString().slice(0, 10);
    timeline.push({ date, balanceMinor: balanceAt(date) });
  }
  const months: Dashboard["months"] = [];
  for (
    let d = new Date(q.from.slice(0, 7) + "-01T00:00:00Z");
    d.toISOString().slice(0, 7) <= q.to.slice(0, 7);
    d.setUTCMonth(d.getUTCMonth() + 1)
  ) {
    const month = d.toISOString().slice(0, 7),
      items = range.filter((t) => t.date.startsWith(month));
    months.push({
      month,
      incomeMinor: sum(items, true),
      expenseMinor: sum(items, false),
    });
  }
  return {
    currency: "UAH",
    minorUnit: 2,
    from: q.from,
    to: q.to,
    asOf: DEMO_TODAY + "T18:30:00Z",
    accounts: accounts.map((a) => ({ ...a, balanceMinor: balance })),
    overview: {
      currentBalanceMinor: balance,
      openingBalanceMinor: balanceAt(q.from, false),
      closingBalanceMinor: balanceAt(q.to),
      incomeMinor: sum(range, true),
      expenseMinor: sum(range, false),
      previousIncomeMinor: sum(previous, true),
      previousExpenseMinor: sum(previous, false),
    },
    timeline,
    months,
    categories: Object.entries(labels)
      .map(([id, label]) => ({
        id,
        label,
        mccCodes: categoryMcc[id],
        amountMinor: sum(
          range.filter((t) => effectiveCategory(t) === id),
          false,
        ),
      }))
      .filter((c) => c.amountMinor > 0)
      .sort((a, b) => b.amountMinor - a.amountMinor),
  };
}
