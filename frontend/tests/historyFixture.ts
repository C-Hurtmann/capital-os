export function historyFixture(preset = "3M", to = "2026-11-12") {
  const months = Number(preset.slice(0, -1));
  const end = new Date(to + "T00:00:00Z");
  const from =
    preset === "All"
      ? "2025-01-01"
      : new Date(
          Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - months + 1, 1),
        )
          .toISOString()
          .slice(0, 10);
  const points = [];
  for (
    let time = Date.parse(from + "T00:00:00Z");
    time <= end.getTime();
    time += 86400000
  )
    points.push({
      date: new Date(time).toISOString().slice(0, 10),
      balanceMinor: 10000,
    });
  return {
    from,
    to,
    timeZone: "Europe/Kyiv" as const,
    currency: "UAH" as const,
    computedAt: to + "T12:00:00Z",
    points,
  };
}
