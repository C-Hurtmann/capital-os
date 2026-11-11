import type { MonthlyCashflowResponse } from "./contracts";

export function parseMonthlyCashflow(value: unknown): MonthlyCashflowResponse {
  const invalid = () => new Error("Invalid monthly cashflow response.");
  if (!value || typeof value !== "object") throw invalid();
  const v = value as Record<string, unknown>;
  if (
    v.currency !== "UAH" ||
    v.timeZone !== "Europe/Kyiv" ||
    !Array.isArray(v.months) ||
    v.months.length !== 12
  )
    throw invalid();
  for (const key of ["from", "to"]) {
    const day = v[key];
    if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day))
      throw invalid();
    const date = new Date(day + "T00:00:00Z");
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== day
    )
      throw invalid();
  }
  const stamp = v.computedAt;
  if (
    typeof stamp !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/.test(stamp)
  )
    throw invalid();
  const cutoff = new Date(stamp);
  if (
    !Number.isFinite(cutoff.getTime()) ||
    cutoff.toISOString().slice(0, 19) !== stamp.slice(0, 19)
  )
    throw invalid();
  // Validate the server's period against its cutoff, never against the browser clock.
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(cutoff);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  const localDay = `${part("year")}-${part("month")}-${part("day")}`;
  const endMonth = Number(part("year")) * 12 + Number(part("month")) - 1;
  const months = v.months.map((entry: unknown, index: number) => {
    if (!entry || typeof entry !== "object") throw invalid();
    const m = entry as Record<string, unknown>;
    const ordinal = endMonth - 11 + index;
    const expected = `${String(Math.floor(ordinal / 12)).padStart(4, "0")}-${String((ordinal % 12) + 1).padStart(2, "0")}`;
    if (
      m.month !== expected ||
      typeof m.incomeMinor !== "number" ||
      !Number.isSafeInteger(m.incomeMinor) ||
      m.incomeMinor < 0 ||
      typeof m.expenseMinor !== "number" ||
      !Number.isSafeInteger(m.expenseMinor) ||
      m.expenseMinor < 0
    )
      throw invalid();
    return {
      month: expected,
      incomeMinor: m.incomeMinor,
      expenseMinor: m.expenseMinor,
    };
  });
  if (v.to !== localDay || v.from !== months[0].month + "-01") throw invalid();
  return {
    from: v.from as string,
    to: v.to as string,
    timeZone: "Europe/Kyiv",
    currency: "UAH",
    computedAt: stamp,
    months,
  };
}

export async function getMonthlyCashflow(
  signal: AbortSignal,
): Promise<MonthlyCashflowResponse> {
  const response = await fetch("/api/v1/cashflow/monthly", {
    signal,
    headers: { Accept: "application/json" },
  });
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
      `Could not load monthly cashflow (HTTP ${response.status}).${reference}`,
    );
  }
  return parseMonthlyCashflow(await response.json());
}
