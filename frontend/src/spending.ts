export const OTHERS_ID = "__others";
export const othersCopy = {
  label: "Others",
  description:
    "Categories grouped to keep the chart readable. Expand to see the breakdown.",
  color: "#7C8591",
};
export const chartHelp =
  "Categories are based on merchant types, not individual items. Transfers and cash withdrawals are included. Refunds do not reduce these totals.";
export interface SpendingCategory {
  id: string;
  amountMinor: number;
}
export interface SpendingSector extends SpendingCategory {
  members?: SpendingCategory[];
}

/** Validate and group exact minor units; rounding is for presentation only. */
export function groupSpending(
  categories: SpendingCategory[],
  total: number,
): SpendingSector[] {
  if (!Number.isSafeInteger(total) || total < 0)
    throw new Error("Invalid spending total");
  const ids = new Set<string>();
  let sum = 0n;
  for (const c of categories) {
    if (
      !c.id ||
      c.id === OTHERS_ID ||
      ids.has(c.id) ||
      !Number.isSafeInteger(c.amountMinor) ||
      c.amountMinor < 0
    )
      throw new Error("Invalid spending category");
    ids.add(c.id);
    sum += BigInt(c.amountMinor);
  }
  if (sum !== BigInt(total)) throw new Error("Spending totals do not match");
  const sorted = categories
    .filter((c) => c.amountMinor > 0)
    .slice()
    .sort(
      (a, b) =>
        b.amountMinor - a.amountMinor ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  if (sorted.length <= 3) return sorted;
  const small = sorted.filter(
    (c) => BigInt(c.amountMinor) * 100n < BigInt(total) * 3n,
  );
  let members = small.length >= 2 ? small : [];
  let visible = sorted.filter((c) => !members.includes(c));
  if (visible.length + (members.length ? 1 : 0) > 8) {
    members = [...visible.slice(7), ...members];
    visible = visible.slice(0, 7);
  }
  if (!members.length) return visible;
  return [
    ...visible,
    {
      id: OTHERS_ID,
      amountMinor: Number(
        members.reduce((s, c) => s + BigInt(c.amountMinor), 0n),
      ),
      members,
    },
  ];
}
export function spendingPercent(amount: number, total: number): string {
  if (!total) return "0.0%";
  const numerator = BigInt(amount) * 1000n;
  if (amount > 0 && numerator < BigInt(total)) return "<0.1%";
  const tenths = (numerator * 2n + BigInt(total)) / (2n * BigInt(total));
  return `${tenths / 10n}.${tenths % 10n}%`;
}
/** Synthetic current-month fixture, not a classification of stored bank transactions. */
export const demoSpendingCategories: SpendingCategory[] = [
  { id: "transfers", amountMinor: 2480000 },
  { id: "groceries", amountMinor: 1875000 },
  { id: "financial", amountMinor: 1080000 },
  { id: "dining", amountMinor: 845000 },
  { id: "health", amountMinor: 620000 },
  { id: "pharmacies", amountMinor: 470000 },
  { id: "pets", amountMinor: 385000 },
  { id: "shopping", amountMinor: 340000 },
  { id: "digital", amountMinor: 160000 },
  { id: "taxis", amountMinor: 115000 },
  { id: "cash", amountMinor: 100000 },
  { id: "other", amountMinor: 55000 },
  { id: "charity", amountMinor: 100 },
];
