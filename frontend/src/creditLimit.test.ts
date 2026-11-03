import { afterEach, describe, expect, it, vi } from "vitest";
import { getCreditLimit, parseCreditLimit } from "./creditLimit";
const stamp = "2026-11-02T12:00:00Z";
afterEach(() => vi.unstubAllGlobals());
describe("approved credit-limit contract", () => {
  it("distinguishes unset and explicitly zero", () => {
    expect(
      parseCreditLimit({ amountMinor: null, effectiveFrom: null }).amountMinor,
    ).toBeNull();
    expect(
      parseCreditLimit({ amountMinor: 0, effectiveFrom: stamp }).amountMinor,
    ).toBe(0);
  });
  it.each([
    null,
    {},
    { amountMinor: null, effectiveFrom: stamp },
    { amountMinor: 0, effectiveFrom: null },
    ...[-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "100"].map((amountMinor) => ({
      amountMinor,
      effectiveFrom: stamp,
    })),
    ...[
      "2026-02-30T12:00:00Z",
      "2026-11-02",
      "2026-11-02T12:00:00+02:00",
      "2026-11-02T24:00:00Z",
    ].map((effectiveFrom) => ({ amountMinor: 1, effectiveFrom })),
  ])("rejects invalid JSON %#", (value) => {
    expect(() => parseCreditLimit(value)).toThrow();
  });
  it("does not expose infrastructure response bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("private infrastructure text", { status: 502 }),
        ),
    );
    await expect(getCreditLimit(new AbortController().signal)).rejects.toThrow(
      "Could not load credit limit (HTTP 502).",
    );
  });
  it("handles Problem Details with a safe request reference", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            type: "about:blank",
            title: "Unavailable",
            status: 503,
            detail: "internal",
            requestId: "req-1",
          }),
          {
            status: 503,
            headers: { "content-type": "application/problem+json" },
          },
        ),
      ),
    );
    await expect(getCreditLimit(new AbortController().signal)).rejects.toThrow(
      "Reference: req-1",
    );
  });
});
