import type { BalanceResponse } from "./contracts";

export function parseBalance(value: unknown): BalanceResponse {
  if (!value || typeof value !== "object")
    throw new Error("Invalid balance response.");
  const v = value as Record<string, unknown>;
  const integer = (n: unknown) =>
    typeof n === "number" && Number.isSafeInteger(n);
  if (
    !integer(v.bankBalanceMinor) ||
    !(v.ownFundsMinor === null || integer(v.ownFundsMinor)) ||
    !(v.creditUsedMinor === null || integer(v.creditUsedMinor)) ||
    typeof v.fetchedAt !== "string"
  )
    throw new Error("Invalid balance response.");
  const stamp = v.fetchedAt;
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/.test(stamp)
  )
    throw new Error("Invalid balance UTC timestamp.");
  const date = new Date(stamp);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 19) !== stamp.slice(0, 19)
  )
    throw new Error("Invalid balance UTC timestamp.");
  return {
    bankBalanceMinor: v.bankBalanceMinor as number,
    ownFundsMinor: v.ownFundsMinor as number | null,
    creditUsedMinor: v.creditUsedMinor as number | null,
    fetchedAt: stamp,
  };
}

export async function getBalance(
  signal: AbortSignal,
): Promise<BalanceResponse> {
  const response = await fetch("/api/v1/balance", {
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
      `Could not load balance (HTTP ${response.status}).${reference}`,
    );
  }
  return parseBalance(await response.json());
}
