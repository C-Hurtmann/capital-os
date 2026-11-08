export { formatMinor as money } from "./money";
export const shortDate = (date: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(date));
export const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("en-GB", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(month + "-01"));
export function change(current: number, previous: number): string {
  if (previous === 0)
    return current === 0 ? "No change" : "No comparison available";
  return `${current >= previous ? "+" : ""}${(((current - previous) / previous) * 100).toFixed(1)}% vs previous period`;
}

export const bankTimestamp = (stamp: string) =>
  new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
    hourCycle: "h23",
  }).format(new Date(stamp)) + " UTC";
