export const money = (value: number) =>
  new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    maximumFractionDigits: 0,
  }).format(value / 100);
export const shortDate = (date: string) =>
  new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(date));
export const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("uk-UA", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(month + "-01"));
export function change(current: number, previous: number): string {
  if (previous === 0)
    return current === 0 ? "Без змін" : "Немає бази порівняння";
  return `${current >= previous ? "+" : ""}${(((current - previous) / previous) * 100).toFixed(1)}% до попереднього періоду`;
}
