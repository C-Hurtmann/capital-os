import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getCreditLimit,
  parseCreditLimit,
  postCreditLimit,
  CREDIT_SAVE_TIMEOUT_MS,
} from "./creditLimit";
const stamp = "2026-11-02T12:00:00Z";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
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

describe("POST credit-limit", () => {
  it("omits Now date, sends exact minor units, and returns validated set state", async () => {
    const result = {
      amountMinor: Number.MAX_SAFE_INTEGER,
      effectiveFrom: stamp,
    };
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(result)));
    vi.stubGlobal("fetch", fetch);
    expect(
      await postCreditLimit({ amountMinor: Number.MAX_SAFE_INTEGER }),
    ).toEqual(result);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/v1/credit-limit");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({
      amountMinor: Number.MAX_SAFE_INTEGER,
    });
  });
  it.each([
    null,
    { amountMinor: null, effectiveFrom: null },
    { amountMinor: 1, effectiveFrom: "bad" },
    { amountMinor: 2, effectiveFrom: stamp },
  ])("treats malformed or mismatched 200 as uncertain %#", async (value) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(value))),
    );
    await expect(postCreditLimit({ amountMinor: 1 })).rejects.toMatchObject({
      uncertain: true,
    });
  });
  it.each([500, 503, 502])(
    "retains uncertain outcome for %s",
    async (status) => {
      const fetch = vi
        .fn()
        .mockResolvedValue(new Response("gateway", { status }));
      vi.stubGlobal("fetch", fetch);
      await expect(postCreditLimit({ amountMinor: 1 })).rejects.toMatchObject({
        uncertain: true,
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it("provides an actionable validation error with requestId", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ requestId: "req-422", detail: "internal" }),
          {
            status: 422,
            headers: { "content-type": "application/problem+json" },
          },
        ),
      ),
    );
    await expect(postCreditLimit({ amountMinor: 1 })).rejects.toMatchObject({
      uncertain: false,
      message: expect.stringContaining("req-422"),
    });
  });
  it("times out once and never automatically retries", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(
      (_url, options) =>
        new Promise((_resolve, reject) =>
          options.signal.addEventListener("abort", () =>
            reject(new Error("aborted")),
          ),
        ),
    );
    vi.stubGlobal("fetch", fetch);
    const result = expect(
      postCreditLimit({ amountMinor: 1 }),
    ).rejects.toMatchObject({ uncertain: true });
    await vi.advanceTimersByTimeAsync(CREDIT_SAVE_TIMEOUT_MS);
    await result;
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("preserves the explicitly selected offset timestamp", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          amountMinor: 0,
          effectiveFrom: "2026-10-15T09:00:00Z",
        }),
      ),
    );
    vi.stubGlobal("fetch", fetch);
    await postCreditLimit({
      amountMinor: 0,
      effectiveFrom: "2026-10-15T12:00:00+03:00",
    });
    expect(JSON.parse(fetch.mock.calls[0][1].body).effectiveFrom).toBe(
      "2026-10-15T12:00:00+03:00",
    );
  });
});
