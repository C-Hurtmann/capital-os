import { kyivDay } from "./balanceHistory";

/** Frontend review model only. This is not an agreed REST DTO. */
export type CreditHistoryEntry = { id: string; startDate: string; amountMinor: number };
export const initialCreditHistory: CreditHistoryEntry[] = [
  { id: "demo-1", startDate: "2026-09-01", amountMinor: 3000000 },
  { id: "demo-2", startDate: "2026-10-01", amountMinor: 4000000 },
  { id: "demo-3", startDate: "2026-10-15", amountMinor: 5000000 },
];
export function validCreditDate(day: string) {
  const ms = Date.parse(day + "T00:00:00Z");
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === day;
}
export function sortedCreditHistory(entries: CreditHistoryEntry[]) {
  return [...entries].sort((a,b) => a.startDate.localeCompare(b.startDate));
}
export function creditOnDate(entries: CreditHistoryEntry[], day: string) {
  return sortedCreditHistory(entries).findLast(e => e.startDate <= day);
}
export function changeCreditHistory(entries: CreditHistoryEntry[], entry: CreditHistoryEntry, quick = false, today = kyivDay(Date.now())) {
  if (!Number.isSafeInteger(entry.amountMinor) || entry.amountMinor < 0) throw new Error("Enter a non-negative amount in UAH within the supported range.");
  if (!validCreditDate(entry.startDate)) throw new Error("Enter a valid start date.");
  if (entry.startDate > today) throw new Error("Choose today or an earlier date in Europe/Kyiv.");
  if (entries.some(e => e.id !== entry.id && e.startDate === entry.startDate)) throw new Error("A limit already exists for this date. Edit that record instead.");
  const latest = sortedCreditHistory(entries).at(-1);
  if (quick && latest && entry.startDate <= latest.startDate) throw new Error("Choose a date after the latest recorded start date, or edit history in Settings.");
  return sortedCreditHistory([...entries.filter(e => e.id !== entry.id), entry]);
}
/** Union of change boundaries exposes every affected interval, including Unknown. */
export function creditHistoryImpact(before: CreditHistoryEntry[], after: CreditHistoryEntry[]) {
  const dates = [...new Set([...before,...after].map(e => e.startDate))].sort();
  return dates.flatMap((startDate,i) => {
    const oldAmount = creditOnDate(before,startDate)?.amountMinor ?? null;
    const newAmount = creditOnDate(after,startDate)?.amountMinor ?? null;
    return oldAmount === newAmount ? [] : [{startDate,until:dates[i+1] ?? null,before:oldAmount,after:newAmount}];
  });
}
