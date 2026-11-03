import type { CreditLimitResponse } from "./contracts";
export function parseCreditLimit(value: unknown): CreditLimitResponse {
  if (!value || typeof value !== "object")
    throw new Error("Invalid credit limit response.");
  const v = value as Record<string, unknown>;
  if (v.amountMinor === null && v.effectiveFrom === null)
    return { amountMinor: null, effectiveFrom: null };
  if (
    typeof v.amountMinor !== "number" ||
    !Number.isSafeInteger(v.amountMinor) ||
    v.amountMinor < 0 ||
    typeof v.effectiveFrom !== "string"
  )
    throw new Error("Invalid credit limit response.");
  const stamp = v.effectiveFrom;
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/.test(stamp)
  )
    throw new Error("Invalid UTC timestamp.");
  const date = new Date(stamp);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 19) !== stamp.slice(0, 19)
  )
    throw new Error("Invalid UTC timestamp.");
  return { amountMinor: v.amountMinor, effectiveFrom: stamp };
}
/** No assumptions about API Gateway errors; never render raw infrastructure bodies. */
export async function getCreditLimit(
  signal: AbortSignal,
): Promise<CreditLimitResponse> {
  const response = await fetch("/api/v1/credit-limit", {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
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
      `Could not load credit limit (HTTP ${response.status}).${reference}`,
    );
  }
  return parseCreditLimit(await response.json());
}
