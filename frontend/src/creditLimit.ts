import type {
  CreditLimitResponse,
  SetCreditLimitRequest,
  SetCreditLimitResponse,
} from "./contracts";
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

export class CreditSaveError extends Error {
  readonly uncertain: boolean;
  constructor(message: string, uncertain: boolean) {
    super(message);
    this.name = "CreditSaveError";
    this.uncertain = uncertain;
  }
}
export function parseSetCreditLimit(value: unknown): SetCreditLimitResponse {
  const parsed = parseCreditLimit(value);
  if (parsed.amountMinor === null)
    throw new Error("POST returned an unset limit.");
  return parsed;
}
export const CREDIT_SAVE_TIMEOUT_MS = 30000;
export async function postCreditLimit(
  request: SetCreditLimitRequest,
): Promise<SetCreditLimitResponse> {
  if (!Number.isSafeInteger(request.amountMinor) || request.amountMinor < 0)
    throw new CreditSaveError("Enter a valid non-negative amount.", false);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CREDIT_SAVE_TIMEOUT_MS);
  try {
    const response = await fetch("/api/v1/credit-limit", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(request),
    });
    if (response.status !== 200) {
      let reference = "";
      if (
        response.headers
          .get("content-type")
          ?.includes("application/problem+json")
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
      const messages: Record<number, string> = {
        400: "The request was rejected. Check the form and try again.",
        415: "The server rejected the request format. Check the API configuration.",
        422: "Check the amount and effective date. The date must not be in the future.",
        401: "Your session is not authorized. Sign in before saving.",
        403: "You do not have permission to change this limit.",
        429: "Too many requests. Wait before saving again.",
      };
      const definite = messages[response.status];
      throw new CreditSaveError(
        `${definite || "Could not confirm that the credit limit was saved."} (HTTP ${response.status}).${reference}`,
        !definite,
      );
    }
    const saved = parseSetCreditLimit(await response.json());
    if (saved.amountMinor !== request.amountMinor)
      throw new Error("Unexpected saved amount.");
    return saved;
  } catch (error) {
    if (error instanceof CreditSaveError) throw error;
    throw new CreditSaveError(
      "Could not confirm that the credit limit was saved. Check the current value before deciding whether to save again.",
      true,
    );
  } finally {
    clearTimeout(timer);
  }
}
