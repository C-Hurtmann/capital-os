import type { CashflowResponse } from "./contracts";

export function parseCashflow(value: unknown): CashflowResponse {
  const invalid = () => new Error("Invalid cashflow response.");
  if (!value || typeof value !== "object") throw invalid();
  const v = value as Record<string, unknown>;
  for (const key of ["incomeMinor", "expenseMinor", "netMinor"]) {
    if (typeof v[key] !== "number" || !Number.isSafeInteger(v[key]))
      throw invalid();
  }
  const income = v.incomeMinor as number,
    expense = v.expenseMinor as number,
    net = v.netMinor as number;
  if (
    income < 0 ||
    expense < 0 ||
    BigInt(net) !== BigInt(income) - BigInt(expense) ||
    v.currency !== "UAH" ||
    v.timeZone !== "Europe/Kyiv"
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
  if (v.to !== localDay || v.from !== localDay.slice(0, 7) + "-01")
    throw invalid();
  return {
    from: v.from as string,
    to: v.to as string,
    timeZone: "Europe/Kyiv",
    currency: "UAH",
    incomeMinor: income,
    expenseMinor: expense,
    netMinor: net,
    computedAt: stamp,
  };
}

export async function getCashflow(
  signal: AbortSignal,
): Promise<CashflowResponse> {
  const response = await fetch("/api/v1/cashflow/current", {
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
      `Could not load cashflow (HTTP ${response.status}).${reference}`,
    );
  }
  return parseCashflow(await response.json());
}
