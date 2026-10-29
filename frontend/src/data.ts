import type { Dashboard, DashboardQuery, Transaction } from "./contracts";
export const DEMO_TODAY = "2026-10-29";
export const labels: Record<string, string> = {
  groceries: "Продукти",
  dining: "Кафе та ресторани",
  shopping: "Покупки",
  transport: "Транспорт",
  home: "Дім та послуги",
  other: "Інше",
};
const mcc: Record<string, string[]> = {
  groceries: ["5411"],
  dining: ["5812", "5814"],
  shopping: ["5311"],
  transport: ["4111", "5541"],
  home: ["4900"],
  other: ["5999"],
};
export const accounts = [
  { id: "black", name: "monobank · Black", currency: "UAH", balanceMinor: 0 },
  { id: "white", name: "monobank · White", currency: "UAH", balanceMinor: 0 },
];
const opening: Record<string, number> = { black: 4820000, white: 1200000 };
export const transactions: Transaction[] = [];
for (
  let day = new Date("2026-01-01T00:00:00Z"), i = 0;
  day.toISOString().slice(0, 10) <= DEMO_TODAY;
  day.setUTCDate(day.getUTCDate() + 1), i++
) {
  const date = day.toISOString().slice(0, 10);
  const n = day.getUTCDate();
  if (n === 5 || n === 20)
    transactions.push({
      date,
      accountId: "black",
      amountMinor: n === 5 ? 4200000 : 1800000,
      category: "salary",
    });
  const category = Object.keys(labels)[i % 6];
  transactions.push({
    date,
    accountId: i % 4 === 0 ? "white" : "black",
    amountMinor: -(18000 + ((i * 7919) % 165000)),
    category,
  });
  if (n === 12)
    transactions.push(
      {
        date,
        accountId: "black",
        amountMinor: -400000,
        category: "transfer",
        transfer: true,
      },
      {
        date,
        accountId: "white",
        amountMinor: 400000,
        category: "transfer",
        transfer: true,
      },
    );
}
export function validateQuery(q: DashboardQuery): void {
  const valid = (s: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s;
  if (!valid(q.from) || !valid(q.to) || q.from > q.to)
    throw new Error(
      "Вкажіть коректний період. Початок має бути до завершення.",
    );
  if (q.to > DEMO_TODAY)
    throw new Error("Дата завершення не може бути пізніше дати демо.");
  if ((Date.parse(q.to) - Date.parse(q.from)) / 86400000 > 365)
    throw new Error("Оберіть період до 366 днів.");
  if (q.currency !== "UAH") throw new Error("Демо підтримує лише UAH.");
  if (q.accountId && !accounts.some((a) => a.id === q.accountId))
    throw new Error("Невідомий рахунок.");
}
export function aggregate(q: DashboardQuery): Dashboard {
  validateQuery(q);
  const selected = accounts.filter((a) => !q.accountId || a.id === q.accountId);
  const tx = transactions.filter((t) =>
    selected.some((a) => a.id === t.accountId),
  );
  const balanceAt = (date: string, inclusive = true) =>
    selected.reduce((s, a) => s + opening[a.id], 0) +
    tx
      .filter((t) => (inclusive ? t.date <= date : t.date < date))
      .reduce((s, t) => s + t.amountMinor, 0);
  const range = tx.filter(
    (t) => t.date >= q.from && t.date <= q.to && !t.transfer,
  );
  const duration = Date.parse(q.to) - Date.parse(q.from) + 86400000;
  const previousStart = new Date(Date.parse(q.from) - duration)
    .toISOString()
    .slice(0, 10);
  const previous = tx.filter(
    (t) => t.date >= previousStart && t.date < q.from && !t.transfer,
  );
  const sum = (items: Transaction[], income: boolean) =>
    items
      .filter((t) => (income ? t.amountMinor > 0 : t.amountMinor < 0))
      .reduce((s, t) => s + Math.abs(t.amountMinor), 0);
  const timeline = [];
  for (let d = Date.parse(q.from); d <= Date.parse(q.to); d += 86400000) {
    const date = new Date(d).toISOString().slice(0, 10);
    timeline.push({ date, balanceMinor: balanceAt(date) });
  }
  const months: Dashboard["months"] = [];
  for (
    let d = new Date(q.from + "T00:00:00Z");
    d.toISOString().slice(0, 7) <= q.to.slice(0, 7);
    d.setUTCMonth(d.getUTCMonth() + 1)
  ) {
    d.setUTCDate(1);
    const month = d.toISOString().slice(0, 7);
    const items = range.filter((t) => t.date.startsWith(month));
    months.push({
      month,
      incomeMinor: sum(items, true),
      expenseMinor: sum(items, false),
    });
  }
  return {
    currency: q.currency,
    minorUnit: 2,
    from: q.from,
    to: q.to,
    asOf: DEMO_TODAY + "T18:30:00Z",
    accounts: accounts.map((a) => ({
      ...a,
      balanceMinor:
        opening[a.id] +
        transactions
          .filter((t) => t.accountId === a.id)
          .reduce((s, t) => s + t.amountMinor, 0),
    })),
    overview: {
      currentBalanceMinor: balanceAt(DEMO_TODAY),
      openingBalanceMinor: balanceAt(q.from, false),
      closingBalanceMinor: balanceAt(q.to),
      incomeMinor: sum(range, true),
      expenseMinor: sum(range, false),
      previousIncomeMinor: sum(previous, true),
      previousExpenseMinor: sum(previous, false),
    },
    timeline,
    categories: Object.entries(labels)
      .map(([id, label]) => ({
        id,
        label,
        mccCodes: mcc[id],
        amountMinor: sum(
          range.filter((t) => t.category === id),
          false,
        ),
      }))
      .filter((c) => c.amountMinor > 0)
      .sort((a, b) => b.amountMinor - a.amountMinor),
    months,
  };
}
export async function getDashboard(
  q: DashboardQuery,
  signal: AbortSignal,
): Promise<Dashboard> {
  const config = import.meta.env;
  if (config.VITE_DATA_SOURCE === "http") {
    const params = new URLSearchParams({
      from: q.from,
      to: q.to,
      currency: q.currency,
      timeZone: "Europe/Kyiv",
      ...(q.accountId ? { accountId: q.accountId } : {}),
    });
    const response = await fetch(
      `${config.VITE_API_BASE_URL || ""}/api/v1/dashboard?${params}`,
      {
        signal,
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      },
    );
    if (!response.ok)
      throw new Error(
        `Не вдалося завантажити дані (${response.status}). Спробуйте ще раз.`,
      );
    return response.json() as Promise<Dashboard>;
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, 350);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
  return aggregate(q);
}
