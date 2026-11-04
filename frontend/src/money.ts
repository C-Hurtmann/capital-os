const MAX_MINOR = BigInt(Number.MAX_SAFE_INTEGER);
export function uahToMinor(raw: string): number {
  const text = raw.trim();
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(text))
    throw new Error(
      "Enter a non-negative UAH amount with up to two decimals (no grouping separators).",
    );
  const [whole, fraction = ""] = text.split(/[.,]/);
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (minor > MAX_MINOR)
    throw new Error(
      "Amount exceeds the supported limit (90,071,992,547,409.91 UAH).",
    );
  return Number(minor);
}
export function minorToUah(value: number): string {
  if (!Number.isSafeInteger(value)) throw new Error("Invalid monetary value.");
  const minor = BigInt(value);
  const absolute = minor < 0n ? -minor : minor;
  return `${minor < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}
const formatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "UAH",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
export function formatMinor(value: number | null): string {
  if (value === null) return "Unavailable";
  const decimal = minorToUah(value);
  const whole = BigInt(value) / 100n;
  // Preserve the sign of amounts between -0.99 and 0 without floating-point division.
  return formatter
    .formatToParts(value < 0 && whole === 0n ? -0 : whole)
    .map((part) => (part.type === "fraction" ? decimal.slice(-2) : part.value))
    .join("");
}
