import { describe, expect, it } from "vitest";
import { resolveKyivTime } from "./kyivTime";
describe("Europe/Kyiv wall time", () => {
  it("uses the historical date offset, not today's offset", () => {
    expect(resolveKyivTime("2026-10-15T12:00")[0].timestamp).toBe(
      "2026-10-15T12:00:00+03:00",
    );
    expect(resolveKyivTime("2026-01-15T12:00")[0].timestamp).toBe(
      "2026-01-15T12:00:00+02:00",
    );
    expect(resolveKyivTime("1989-01-15T12:00")[0].offsetLabel).toBe(
      "UTC+03:00",
    );
  });
  it("rejects nonexistent spring time without shifting it", () => {
    expect(resolveKyivTime("2026-03-29T03:30")).toEqual([]);
    expect(resolveKyivTime("2026-03-29T02:59")).toHaveLength(1);
    expect(resolveKyivTime("2026-03-29T04:00")).toHaveLength(1);
  });
  it("requires a choice between two autumn occurrences", () => {
    const choices = resolveKyivTime("2026-10-25T03:30");
    expect(choices.map((c) => c.offsetLabel)).toEqual([
      "UTC+03:00",
      "UTC+02:00",
    ]);
    expect(choices.map((c) => c.utc)).toEqual([
      "2026-10-25T00:30:00.000Z",
      "2026-10-25T01:30:00.000Z",
    ]);
  });
  it.each([
    "",
    "2026-02-30T12:00",
    "2026-01-01T24:00",
    "0000-01-01T12:00",
    "2026-01-01T12:00Z",
  ])("rejects invalid local input %s", (value) =>
    expect(() => resolveKyivTime(value)).toThrow(),
  );
  it("keeps seconds in the explicit instant", () => {
    expect(resolveKyivTime("2026-10-15T12:00:45")[0].utc).toBe(
      "2026-10-15T09:00:45.000Z",
    );
  });
});
