import type { SpendingResponse } from "./contracts";
import { categoryCatalogue } from "./categoryCatalogue";
import { kyivDay } from "./balanceHistory";

/** Validate the full resource before replacing any confirmed widget state. */
export function parseSpending(value: unknown): SpendingResponse {
  const invalid = () => new Error("Invalid spending response.");
  if (!value || typeof value !== "object") throw invalid();
  const v = value as Record<string, unknown>;
  if (
    v.currency !== "UAH" ||
    v.timeZone !== "Europe/Kyiv" ||
    typeof v.totalMinor !== "number" ||
    !Number.isSafeInteger(v.totalMinor) ||
    v.totalMinor < 0 ||
    !Array.isArray(v.categories) ||
    typeof v.computedAt !== "string"
  )
    throw invalid();
  const stamp = v.computedAt;
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/.test(
      stamp,
    ) ||
    !Number.isFinite(Date.parse(stamp)) ||
    new Date(stamp).toISOString().slice(0, 19) !== stamp.slice(0, 19)
  )
    throw invalid();
  // Server cutoff, not browser time or the time when the request completed.
  const to = kyivDay(stamp);
  const from = to.slice(0, 7) + "-01";
  if (v.from !== from || v.to !== to) throw invalid();
  const seen = new Set<string>();
  let sum = 0n;
  let previous: { id: string; amountMinor: number } | undefined;
  const categories = v.categories.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") throw invalid();
    const c = entry as Record<string, unknown>;
    if (
      typeof c.id !== "string" ||
      !Object.hasOwn(categoryCatalogue, c.id) ||
      seen.has(c.id) ||
      typeof c.amountMinor !== "number" ||
      !Number.isSafeInteger(c.amountMinor) ||
      c.amountMinor <= 0
    )
      throw invalid();
    if (
      previous &&
      (previous.amountMinor < c.amountMinor ||
        (previous.amountMinor === c.amountMinor && previous.id >= c.id))
    )
      throw invalid();
    seen.add(c.id);
    sum += BigInt(c.amountMinor);
    previous = { id: c.id, amountMinor: c.amountMinor };
    return previous;
  });
  if (sum !== BigInt(v.totalMinor)) throw invalid();
  return {
    from,
    to,
    computedAt: stamp,
    timeZone: "Europe/Kyiv",
    currency: "UAH",
    totalMinor: v.totalMinor,
    categories,
  };
}

export async function getSpending(
  signal: AbortSignal,
): Promise<SpendingResponse> {
  const response = await fetch("/api/v1/spending/categories", {
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
      ) {
        reference = ` Reference: ${problem.requestId}.`;
      }
    }
    throw new Error(
      `Could not load spending (HTTP ${response.status}).${reference}`,
    );
  }
  return parseSpending(await response.json());
}
