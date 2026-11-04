const zone = "Europe/Kyiv";
const partsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: zone,
  calendar: "iso8601",
  numberingSystem: "latn",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
function localParts(instant: number): string {
  const p = Object.fromEntries(
    partsFormatter
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  return `${p.year.padStart(4, "0")}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}
export interface KyivInstant {
  timestamp: string;
  offsetLabel: string;
  utc: string;
}
/** Resolve wall time by candidate offsets and exact round-trip, never browser timezone. */
export function resolveKyivTime(input: string): KyivInstant[] {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(input))
    throw new Error("Enter a valid date and time.");
  const wall = input.length === 16 ? `${input}:00` : input;
  const assumedUTC = Date.parse(`${wall}Z`);
  if (
    Number(wall.slice(0, 4)) < 1 ||
    !Number.isFinite(assumedUTC) ||
    new Date(assumedUTC).toISOString().slice(0, 19) !== wall
  )
    throw new Error("Enter a valid date and time.");
  // Kyiv offset changes are captured on both sides of its historical transitions.
  const offsets = new Set<number>();
  for (let hours = -48; hours <= 48; hours += 6) {
    const probe = assumedUTC + hours * 3600000;
    offsets.add((Date.parse(`${localParts(probe)}Z`) - probe) / 1000);
  }
  return [...offsets]
    .map((offset) => {
      const instant = assumedUTC - offset * 1000;
      if (localParts(instant) !== wall) return null;
      const abs = Math.abs(offset);
      const suffix = `${offset >= 0 ? "+" : "-"}${String(Math.floor(abs / 3600)).padStart(2, "0")}:${String(Math.floor((abs % 3600) / 60)).padStart(2, "0")}`;
      const seconds = abs % 60;
      const utc = new Date(instant).toISOString();
      return {
        // Old local-mean-time offsets contain seconds, which RFC3339 offsets cannot encode.
        // In that case serialize the same unambiguous instant in UTC (Z).
        timestamp: seconds ? utc : `${wall}${suffix}`,
        offsetLabel: `UTC${suffix}${seconds ? `:${String(seconds).padStart(2, "0")}` : ""}`,
        utc,
      };
    })
    .filter((v): v is KyivInstant => v !== null)
    .sort((a, b) => a.utc.localeCompare(b.utc));
}
export function effectiveDateLabel(utc: string | null): string {
  if (!utc) return "Not set";
  return `${new Intl.DateTimeFormat("en-GB", { timeZone: zone, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "shortOffset" }).format(new Date(utc))} · ${zone}`;
}
