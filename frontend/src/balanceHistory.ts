import type { BalanceHistoryResponse, HistoryPreset } from "./contracts";
export const DAY_MS = 86400000;
/** Calendar-day coordinate, not the UTC instant of Kyiv midnight. */
export const dayNumber = (date: string) => Date.parse(date + "T00:00:00Z");
export const dayString = (value: number) =>
  new Date(value).toISOString().slice(0, 10);
export function kyivDay(instant: string | number): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function presetFrom(
  preset: Exclude<HistoryPreset, "All">,
  to: string,
): string {
  const ordinal =
    Number(to.slice(0, 4)) * 12 +
    Number(to.slice(5, 7)) -
    Number(preset.slice(0, -1));
  return `${String(Math.floor(ordinal / 12)).padStart(4, "0")}-${String((ordinal % 12) + 1).padStart(2, "0")}-01`;
}
function validDay(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(dayNumber(v)) &&
    dayString(dayNumber(v)) === v
  );
}
export function parseBalanceHistory(
  value: unknown,
  preset: HistoryPreset,
): BalanceHistoryResponse {
  const invalid = () => new Error("Invalid balance history response.");
  if (!value || typeof value !== "object") throw invalid();
  const v = value as Record<string, unknown>;
  if (
    v.timeZone !== "Europe/Kyiv" ||
    v.currency !== "UAH" ||
    !validDay(v.to) ||
    !Array.isArray(v.points) ||
    typeof v.computedAt !== "string"
  )
    throw invalid();
  const stamp = v.computedAt;
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/.test(
      stamp,
    ) ||
    !Number.isFinite(Date.parse(stamp)) ||
    new Date(stamp).toISOString().slice(0, 19) !== stamp.slice(0, 19) ||
    kyivDay(stamp) !== v.to
  )
    throw invalid();
  if (v.from === null) {
    if (preset !== "All" || v.points.length) throw invalid();
  } else if (!validDay(v.from) || v.from > v.to) throw invalid();
  if (preset !== "All" && v.from !== presetFrom(preset, v.to)) throw invalid();
  if (preset === "All" && v.from !== null && !v.points.length) throw invalid();
  let previous: number | undefined;
  let known = false;
  const points = v.points.map((entry: unknown, index: number) => {
    if (!entry || typeof entry !== "object") throw invalid();
    const p = entry as Record<string, unknown>;
    if (
      !validDay(p.date) ||
      typeof v.from !== "string" ||
      p.date < v.from ||
      p.date > (v.to as string)
    )
      throw invalid();
    const day = dayNumber(p.date);
    if (
      previous !== undefined &&
      (day <= previous || (known && day !== previous + DAY_MS))
    )
      throw invalid();
    if (index === 0 && p.date !== v.from) throw invalid();
    if (p.balanceMinor === null) {
      if (
        preset === "All" ||
        index !== 0 ||
        (v.points instanceof Array && v.points.length < 2)
      )
        throw invalid();
    } else {
      if (
        typeof p.balanceMinor !== "number" ||
        !Number.isSafeInteger(p.balanceMinor)
      )
        throw invalid();
      known = true;
    }
    previous = day;
    return { date: p.date, balanceMinor: p.balanceMinor as number | null };
  });
  if (points.length && (!known || points[points.length - 1].date !== v.to))
    throw invalid();
  return {
    from: v.from as string | null,
    to: v.to,
    computedAt: stamp,
    timeZone: "Europe/Kyiv",
    currency: "UAH",
    points,
  };
}
/** Returns a presentation slice without extrapolating values or changing cutoff. */
export function sliceHistory(
  data: BalanceHistoryResponse,
  source: HistoryPreset,
  target: HistoryPreset,
): BalanceHistoryResponse | undefined {
  if (source === target) return data;
  if (target === "All") return undefined;
  const from = presetFrom(target, data.to);
  if (source !== "All" && (data.from === null || from < data.from))
    return undefined;
  const points = data.points.filter((p) => p.date >= from);
  if (points.length && points[0].date > from)
    points.unshift({ date: from, balanceMinor: null });
  return { ...data, from, points };
}

export async function getBalanceHistory(
  preset: HistoryPreset,
  signal: AbortSignal,
): Promise<BalanceHistoryResponse> {
  const response = await fetch(
    `/api/v1/balance-history?preset=${encodeURIComponent(preset)}`,
    {
      signal,
      headers: { Accept: "application/json" },
    },
  );
  if (response.status !== 200) {
    let reference = "";
    if (
      response.headers.get("content-type")?.includes("application/problem+json")
    ) {
      const problem: unknown = await response.json().catch(() => null);
      if (
        problem &&
        typeof problem === "object" &&
        "requestId" in problem &&
        typeof problem.requestId === "string" &&
        /^[a-zA-Z0-9_-]{1,100}$/.test(problem.requestId)
      )
        reference = ` Reference: ${problem.requestId}.`;
    }
    throw new Error(
      `Could not load balance history (HTTP ${response.status}).${reference}`,
    );
  }
  return parseBalanceHistory(await response.json(), preset);
}
