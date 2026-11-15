import { categoryCatalogue } from "./categoryCatalogue";
import { kyivDay } from "./balanceHistory";

export const liveTransactions =
  import.meta.env.VITE_TRANSACTIONS_SOURCE === "api";
export type TransactionFilters = {
  from: string;
  to: string;
  direction: "" | "income" | "expense";
};
export const emptyFilters: TransactionFilters = {
  from: "",
  to: "",
  direction: "",
};
export type BankTransaction = {
  bankId: string;
  occurredAt: string;
  amountMinor: number;
  operationAmountMinor: number;
  operationCurrencyCode: number;
  balanceMinor: number;
  mcc: number;
  commissionMinor: number;
  categoryId: string | null;
};
export type TransactionsResponse = {
  computedAt: string;
  timeZone: "Europe/Kyiv";
  currency: "UAH";
  items: BankTransaction[];
  nextCursor: string | null;
};
export function validateTransactionFilters(
  q: TransactionFilters,
  today = kyivDay(Date.now()),
) {
  const errors: Partial<Record<"from" | "to", string>> = {};
  for (const key of ["from", "to"] as const) {
    const v = q[key];
    if (!v) continue;
    const ms = Date.parse(v + "T00:00:00Z");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
      !Number.isFinite(ms) ||
      new Date(ms).toISOString().slice(0, 10) !== v
    )
      errors[key] = "Enter a valid date as YYYY-MM-DD.";
    else if (v > today) errors[key] = "Choose today or an earlier date.";
  }
  if (!errors.from && !errors.to && q.from && q.to && q.from > q.to)
    errors.to = "To date must be on or after From date.";
  return errors;
}
function utc(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3}0{0,6})?(?:Z|\+00:00)$/.test(
      value,
    ) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 19) === value.slice(0, 19)
  );
}
/** DynamoDB string order is UTF-8 byte order, not locale collation. */
function compareIds(a: string, b: string) {
  const encoder = new TextEncoder(),
    x = encoder.encode(a),
    y = encoder.encode(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++)
    if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}
export function validateTransactionOrder(items: BankTransaction[]) {
  const seen = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    const t = items[i],
      prev = items[i - 1];
    if (
      seen.has(t.bankId) ||
      (prev &&
        (Date.parse(prev.occurredAt) < Date.parse(t.occurredAt) ||
          (Date.parse(prev.occurredAt) === Date.parse(t.occurredAt) &&
            compareIds(prev.bankId, t.bankId) <= 0)))
    )
      throw new Error(
        "Invalid transaction order or duplicate transaction. Refresh the list.",
      );
    seen.add(t.bankId);
  }
}
export function parseTransactions(
  value: unknown,
  q: TransactionFilters = emptyFilters,
): TransactionsResponse {
  const invalid = () =>
    new Error(
      "Invalid transactions response. Your confirmed results are unchanged.",
    );
  if (!value || typeof value !== "object") throw invalid();
  const v = value as Record<string, unknown>;
  if (
    !utc(v.computedAt) ||
    v.currency !== "UAH" ||
    v.timeZone !== "Europe/Kyiv" ||
    !Array.isArray(v.items) ||
    v.items.length > 20 ||
    !(
      v.nextCursor === null ||
      (typeof v.nextCursor === "string" && v.nextCursor.length > 0)
    )
  )
    throw invalid();
  const items = v.items.map((item: unknown) => {
    if (!item || typeof item !== "object") throw invalid();
    const t = item as Record<string, unknown>;
    if (
      typeof t.bankId !== "string" ||
      !t.bankId ||
      !utc(t.occurredAt) ||
      Date.parse(t.occurredAt) > Date.parse(v.computedAt as string)
    )
      throw invalid();
    for (const key of [
      "amountMinor",
      "operationAmountMinor",
      "balanceMinor",
      "commissionMinor",
    ])
      if (typeof t[key] !== "number" || !Number.isSafeInteger(t[key]))
        throw invalid();
    for (const [key, max] of [
      ["mcc", 9999],
      ["operationCurrencyCode", 999],
    ] as const)
      if (
        typeof t[key] !== "number" ||
        !Number.isInteger(t[key]) ||
        t[key] < 0 ||
        t[key] > max
      )
        throw invalid();
    const amount = t.amountMinor as number;
    if (
      amount < 0
        ? typeof t.categoryId !== "string" ||
          !Object.hasOwn(categoryCatalogue, t.categoryId)
        : t.categoryId !== null
    )
      throw invalid();
    const day = kyivDay(t.occurredAt);
    if (
      (q.from && day < q.from) ||
      (q.to && day > q.to) ||
      (q.direction === "income" && amount <= 0) ||
      (q.direction === "expense" && amount >= 0)
    )
      throw invalid();
    return t as BankTransaction;
  });
  validateTransactionOrder(items);
  return {
    computedAt: v.computedAt,
    currency: "UAH",
    timeZone: "Europe/Kyiv",
    items,
    nextCursor: v.nextCursor as string | null,
  };
}
export class TransactionsError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function getTransactions(
  q: TransactionFilters,
  cursor: string | null,
  signal: AbortSignal,
) {
  const params = new URLSearchParams({ limit: "20" });
  for (const key of ["from", "to", "direction"] as const)
    if (q[key]) params.set(key, q[key]);
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(`/api/v1/transactions?${params}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (response.status !== 200) {
    let reference = "";
    if (
      response.headers.get("content-type")?.includes("application/problem+json")
    ) {
      const p = await response.json().catch(() => null);
      if (
        typeof p?.requestId === "string" &&
        /^[a-zA-Z0-9_-]{1,100}$/.test(p.requestId)
      )
        reference = ` Reference: ${p.requestId}.`;
    }
    throw new TransactionsError(
      `Could not load transactions (HTTP ${response.status}).${reference}`,
      response.status,
    );
  }
  return parseTransactions(await response.json(), q);
}
const currencies: Record<number, [string, number]> = {
  980: ["UAH", 2],
  840: ["USD", 2],
  978: ["EUR", 2],
  826: ["GBP", 2],
  985: ["PLN", 2],
  203: ["CZK", 2],
  756: ["CHF", 2],
  392: ["JPY", 0],
  414: ["KWD", 3],
};
export function transactionMoney(value: number, code = 980, signed = false) {
  if (!Number.isSafeInteger(value)) throw new Error("Invalid monetary value.");
  const currency = currencies[code];
  if (!currency)
    return `${value.toLocaleString("en-US")} minor units · code ${code}`;
  const [name, exponent] = currency,
    factor = 10n ** BigInt(exponent),
    raw = BigInt(value),
    abs = raw < 0n ? -raw : raw;
  return `${value < 0 ? "−" : signed && value > 0 ? "+" : ""}${(abs / factor).toLocaleString("en-US")}${exponent ? "." + String(abs % factor).padStart(exponent, "0") : ""} ${name}`;
}
