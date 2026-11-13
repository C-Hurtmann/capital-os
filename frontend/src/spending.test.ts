import { describe, expect, it } from "vitest";
import {
  groupSpending,
  spendingPercent,
  OTHERS_ID,
  demoSpendingCategories,
} from "./spending";
import { categoryCatalogue } from "./categoryCatalogue";
const make = (amounts: number[]) =>
  amounts.map((amountMinor, i) => ({
    id: String(i).padStart(2, "0"),
    amountMinor,
  }));
const group = (amounts: number[]) =>
  groupSpending(
    make(amounts),
    amounts.reduce((a, b) => a + b, 0),
  );
describe("spending grouping", () => {
  it("keeps up to three positive categories and excludes zero", () => {
    expect(group([9800, 100, 100, 0])).toHaveLength(3);
    expect(group([0])).toEqual([]);
    expect(group([1])).toEqual(make([1]));
  });
  it("groups strictly below 3%, keeping exact 3% and a lone small category", () => {
    expect(group([9000, 400, 300, 300])).toHaveLength(4);
    expect(group([9000, 500, 300, 200])).toHaveLength(4);
    const result = group([9200, 400, 200, 200]);
    expect(result.at(-1)).toMatchObject({ id: OTHERS_ID, amountMinor: 400 });
    expect(result.at(-1)?.members).toHaveLength(2);
  });
  it("caps at eight, including Others, even above threshold", () => {
    const result = group(Array(10).fill(100));
    expect(result).toHaveLength(8);
    expect(result.at(-1)).toMatchObject({ id: OTHERS_ID, amountMinor: 300 });
    expect(result.slice(0, 7).map((c) => c.id)).toEqual(
      make(Array(7).fill(100)).map((c) => c.id),
    );
  });
  it("keeps Others last even when largest, preserves exact totals", () => {
    const result = group(Array(39).fill(100));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: OTHERS_ID, amountMinor: 3900 });
    const demo = groupSpending(
      demoSpendingCategories,
      demoSpendingCategories.reduce((s, c) => s + c.amountMinor, 0),
    );
    expect(demo).toHaveLength(8);
    expect(demo.at(-1)?.members?.some((c) => c.id === "other")).toBe(true);
  });
  it("uses exact arithmetic at safe integer boundary", () => {
    const total = Number.MAX_SAFE_INTEGER;
    const categories = make([total - 3, 1, 1, 1]);
    expect(groupSpending(categories, total).at(-1)?.amountMinor).toBe(3);
    expect(spendingPercent(1, total)).toBe("<0.1%");
  });
  it.each([-1, NaN, Infinity, 0.1, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid money %s",
    (value) => {
      expect(() =>
        groupSpending([{ id: "a", amountMinor: value }], value),
      ).toThrow();
    },
  );
  it("rejects mismatched totals, duplicates and reserved IDs", () => {
    expect(() => groupSpending(make([1]), 2)).toThrow();
    expect(() =>
      groupSpending(
        [
          { id: "a", amountMinor: 1 },
          { id: "a", amountMinor: 1 },
        ],
        2,
      ),
    ).toThrow();
    expect(() =>
      groupSpending([{ id: OTHERS_ID, amountMinor: 1 }], 1),
    ).toThrow();
  });
  it("formats shares without forcing totals or losing tiny amounts", () => {
    expect(spendingPercent(1, 10000)).toBe("<0.1%");
    expect(spendingPercent(1, 1000)).toBe("0.1%");
    expect(spendingPercent(1, 3)).toBe("33.3%");
    expect(spendingPercent(1, 1)).toBe("100.0%");
    expect(spendingPercent(0, 0)).toBe("0.0%");
  });
  it("has the 39 approved display categories and separate fallback", () => {
    expect(Object.keys(categoryCatalogue)).toHaveLength(39);
    expect(categoryCatalogue.fast_food).toBeUndefined();
    expect(categoryCatalogue.other).toMatchObject({
      label: "Uncategorized",
      color: "#B5AAA0",
    });
    expect(categoryCatalogue.dining.label).toBe("Restaurants & cafés");
  });
});
