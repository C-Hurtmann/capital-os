export const monthlyFixture = {
  from: "2025-12-01",
  to: "2026-11-11",
  timeZone: "Europe/Kyiv",
  currency: "UAH",
  computedAt: "2026-11-11T12:00:00Z",
  months: Array.from({ length: 12 }, (_, i) => ({
    month: i === 0 ? "2025-12" : `2026-${String(i).padStart(2, "0")}`,
    incomeMinor: 0,
    expenseMinor: 0,
  })),
};
