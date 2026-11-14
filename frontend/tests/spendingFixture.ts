export const spendingFixture = {
  from: "2026-11-01",
  to: "2026-11-14",
  computedAt: "2026-11-14T12:00:00Z",
  timeZone: "Europe/Kyiv" as const,
  currency: "UAH" as const,
  totalMinor: 59900,
  categories: [
    { id: "groceries", amountMinor: 32100 },
    { id: "financial", amountMinor: 17800 },
    { id: "other", amountMinor: 10000 },
  ],
};
