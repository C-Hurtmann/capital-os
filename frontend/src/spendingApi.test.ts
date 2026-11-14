import { afterEach, describe, expect, it, vi } from "vitest";
import { parseSpending, getSpending } from "./spendingApi";
import { spendingFixture as data } from "../tests/spendingFixture";
import { categoryCatalogue } from "./categoryCatalogue";
afterEach(() => vi.unstubAllGlobals());
describe("Spending GET v0.3", () => {
  it("accepts the contract, known fallback and zero recorded expenses", () => {
    expect(parseSpending(data)).toEqual(data);
    expect(
      parseSpending({ ...data, totalMinor: 0, categories: [] }),
    ).toMatchObject({ totalMinor: 0, categories: [] });
  });
  it.each(Object.keys(categoryCatalogue))("accepts approved ID %s", (id) => {
    expect(
      parseSpending({
        ...data,
        totalMinor: 1,
        categories: [{ id, amountMinor: 1 }],
      }).categories[0].id,
    ).toBe(id);
  });
  it.each([
    "from",
    "to",
    "computedAt",
    "timeZone",
    "currency",
    "totalMinor",
    "categories",
  ])("rejects missing and null %s", (key) => {
    const missing: Record<string, unknown> = { ...data };
    delete missing[key];
    expect(() => parseSpending(missing)).toThrow();
    expect(() => parseSpending({ ...data, [key]: null })).toThrow();
  });
  it.each([
    "new_id",
    "__others",
    "fast_food",
    "credit",
    "toString",
    "__proto__",
    "",
  ])("rejects unexpected ID %s without fallback", (id) => {
    expect(() =>
      parseSpending({
        ...data,
        totalMinor: 1,
        categories: [{ id, amountMinor: 1 }],
      }),
    ).toThrow();
  });
  it.each([
    0,
    -1,
    0.1,
    "1",
    null,
    true,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects invalid category amount %s", (amountMinor) => {
    expect(() =>
      parseSpending({
        ...data,
        totalMinor: amountMinor,
        categories: [{ id: "other", amountMinor }],
      }),
    ).toThrow();
  });
  it("rejects duplicate IDs, invalid order and mismatched sums", () => {
    expect(() =>
      parseSpending({
        ...data,
        totalMinor: 2,
        categories: [
          { id: "other", amountMinor: 1 },
          { id: "other", amountMinor: 1 },
        ],
      }),
    ).toThrow();
    expect(() =>
      parseSpending({ ...data, categories: [...data.categories].reverse() }),
    ).toThrow();
    expect(() =>
      parseSpending({
        ...data,
        totalMinor: 2,
        categories: [
          { id: "other", amountMinor: 1 },
          { id: "groceries", amountMinor: 1 },
        ],
      }),
    ).toThrow();
    expect(
      parseSpending({
        ...data,
        totalMinor: 2,
        categories: [
          { id: "groceries", amountMinor: 1 },
          { id: "other", amountMinor: 1 },
        ],
      }),
    ).toBeTruthy();
    expect(() => parseSpending({ ...data, totalMinor: 59901 })).toThrow();
    expect(() => parseSpending({ ...data, categories: [] })).toThrow();
  });
  it("handles safe boundary and rejects sum overflow without rounding", () => {
    expect(
      parseSpending({
        ...data,
        totalMinor: Number.MAX_SAFE_INTEGER,
        categories: [{ id: "other", amountMinor: Number.MAX_SAFE_INTEGER }],
      }).totalMinor,
    ).toBe(Number.MAX_SAFE_INTEGER);
    expect(() =>
      parseSpending({
        ...data,
        totalMinor: Number.MAX_SAFE_INTEGER,
        categories: [
          { id: "other", amountMinor: Number.MAX_SAFE_INTEGER },
          { id: "groceries", amountMinor: 1 },
        ],
      }),
    ).toThrow();
  });
  it.each([
    ["2026-10-31T22:30:00Z", "2026-11-01"],
    ["2026-03-31T21:30:00Z", "2026-04-01"],
    ["2026-12-31T22:30:00.123456+00:00", "2027-01-01"],
  ])("uses Kyiv cutoff %s independently of browser clock", (computedAt, to) => {
    expect(
      parseSpending({ ...data, computedAt, to, from: to.slice(0, 7) + "-01" })
        .to,
    ).toBe(to);
  });
  it.each([
    "2026-02-30T12:00:00Z",
    "2026-11-14T25:00:00Z",
    "2026-11-14T12:00:00",
    "2026-11-14T12:00:00+02:00",
    "bad",
  ])("rejects invalid UTC cutoff %s", (computedAt) =>
    expect(() => parseSpending({ ...data, computedAt })).toThrow(),
  );
  it("rejects incorrect dates, currency and timezone", () => {
    for (const patch of [
      { from: "2026-10-01" },
      { to: "2026-11-13" },
      { currency: "USD" },
      { timeZone: "UTC" },
    ])
      expect(() => parseSpending({ ...data, ...patch })).toThrow();
  });
  it("fetches a relative GET with signal, no body/query", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(data), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const signal = new AbortController().signal;
    expect(await getSpending(signal)).toEqual(data);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/spending/categories",
      { signal, headers: { Accept: "application/json" } },
    );
  });
  it.each([500, 503])("handles Problem Details %s", async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ requestId: "test-123" }), {
          status,
          headers: { "content-type": "application/problem+json" },
        }),
      ),
    );
    await expect(getSpending(new AbortController().signal)).rejects.toThrow(
      `HTTP ${status}). Reference: test-123`,
    );
  });
  it("handles gateway HTML and malformed successful JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response("<html>Bad gateway</html>", { status: 502 }),
        )
        .mockResolvedValueOnce(new Response("bad", { status: 200 })),
    );
    await expect(getSpending(new AbortController().signal)).rejects.toThrow(
      "HTTP 502",
    );
    await expect(getSpending(new AbortController().signal)).rejects.toThrow();
  });
});
