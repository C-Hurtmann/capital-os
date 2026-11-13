import { test, expect, type Route } from "@playwright/test";
import { historyFixture } from "./historyFixture";
import { monthlyFixture } from "./monthlyFixture";
test.use({
  baseURL: "http://127.0.0.1:5178",
  timezoneId: "America/Los_Angeles",
});
const endpoint = "**/api/v1/balance-history?*";
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-12T12:00:00Z") });
  await page.route("**/api/v1/balance", (r) =>
    r.fulfill({
      json: {
        bankBalanceMinor: 100,
        ownFundsMinor: null,
        creditUsedMinor: null,
        fetchedAt: "2026-11-12T12:00:00Z",
      },
    }),
  );
  await page.route("**/api/v1/credit-limit", (r) =>
    r.fulfill({ json: { amountMinor: null, effectiveFrom: null } }),
  );
  await page.route("**/api/v1/cashflow/current", (r) =>
    r.fulfill({
      json: {
        ...monthlyFixture,
        from: "2026-11-01",
        incomeMinor: 0,
        expenseMinor: 0,
        netMinor: 0,
      },
    }),
  );
  await page.route("**/api/v1/cashflow/monthly", (r) =>
    r.fulfill({ json: monthlyFixture }),
  );
});
test("default 3M, All to 3M reuse and refresh invalidation", async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route(endpoint, (r) => {
    const preset = new URL(r.request().url()).searchParams.get("preset")!;
    requests.push(preset);
    return r.fulfill({ json: historyFixture(preset) });
  });
  await page.goto("/");
  await expect(page.locator(".range-label")).toContainText("1 Sept");
  expect(requests.every((p) => p === "3M")).toBe(true);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.locator(".range-label")).toContainText("1 Jan");
  const n = requests.length;
  await page.getByRole("button", { name: "3M", exact: true }).click();
  await expect(page.locator(".range-label")).toContainText("1 Sept");
  expect(requests).toHaveLength(n);
  await page.evaluate(() =>
    window.dispatchEvent(new Event("capital-transactions-synced")),
  );
  await expect.poll(() => requests.length).toBeGreaterThan(n);
});
test("leading gap uses proportional x spacing, negative and zero values", async ({
  page,
}) => {
  const v = historyFixture("3M");
  v.points = v.points.filter((p) => p.date >= "2026-11-10");
  v.points[0].balanceMinor = -100;
  v.points[1].balanceMinor = 0;
  v.points.unshift({ date: v.from, balanceMinor: null as unknown as number });
  await page.route(endpoint, (r) => r.fulfill({ json: v }));
  await page.goto("/");
  await expect(page.locator(".timeline")).toContainText(
    "No data before 2026-11-10",
  );
  const chart = page.locator(".timeline [role=application]");
  await chart.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.locator(".timeline .recharts-tooltip-wrapper"),
  ).toContainText("1.00");
  await page.keyboard.press("ArrowRight");
  await expect(
    page.locator(".timeline .recharts-tooltip-wrapper"),
  ).toContainText("0.00");
  // Known segment occupies only the last 2 days of the 72-day domain.
  const path = page.locator(".timeline .recharts-area-curve");
  const rect = await path.boundingBox();
  const box = await chart.boundingBox();
  expect(rect!.width).toBeLessThan(box!.width / 5);
});
test("empty All and one-day history", async ({ page }) => {
  let single = false;
  await page.route(endpoint, (r) => {
    const preset = new URL(r.request().url()).searchParams.get("preset")!;
    return r.fulfill({
      json:
        preset === "All"
          ? {
              ...historyFixture("All"),
              from: single ? "2026-11-12" : null,
              points: single ? [{ date: "2026-11-12", balanceMinor: 0 }] : [],
            }
          : historyFixture(preset),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.locator(".timeline .empty")).toHaveText("No data.");
  single = true;
  await page.getByRole("button", { name: "Reload data", exact: true }).click();
  await expect(page.locator(".timeline .recharts-area-dot")).toHaveCount(1);
});
test("503 retry and malformed refresh retain original metadata", async ({
  page,
}) => {
  let mode = "error";
  await page.route(endpoint, (r) =>
    mode === "error"
      ? r.fulfill({ status: 503, body: "private" })
      : r.fulfill({
          json:
            mode === "invalid"
              ? {
                  ...historyFixture(),
                  points: [{ date: "bad", balanceMinor: 0 }],
                }
              : historyFixture(),
        }),
  );
  await page.goto("/");
  const retry = page.getByRole("button", {
    name: "Retry history",
    exact: true,
  });
  await expect(retry).toBeVisible();
  await expect(page.locator(".timeline .empty")).toHaveCount(0);
  mode = "ok";
  await retry.click();
  await expect(page.locator(".range-label time")).toBeVisible();
  const label = await page.locator(".range-label").innerText();
  mode = "invalid";
  await page.getByRole("button", { name: "Reload data", exact: true }).click();
  await expect(retry).toBeVisible();
  await expect(page.locator(".range-label")).toHaveText(label);
});
test("old wide request cannot reappear after invalidation", async ({
  page,
}) => {
  let old: Route | undefined;
  let hold = false;
  await page.route(endpoint, (r) => {
    const preset = new URL(r.request().url()).searchParams.get("preset")!;
    if (preset === "All" && hold) {
      old = r;
      return;
    }
    return r.fulfill({ json: historyFixture(preset) });
  });
  await page.goto("/");
  await expect(page.locator(".range-label")).toBeVisible();
  hold = true;
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect.poll(() => !!old).toBe(true);
  await page.getByRole("button", { name: "3M", exact: true }).click();
  await page.evaluate(() =>
    window.dispatchEvent(new Event("capital-transactions-synced")),
  );
  await expect(page.locator(".range-label")).toContainText("1 Sept");
  await old!.fulfill({ json: historyFixture("All") }).catch(() => {});
  await expect(page.locator(".range-label")).toContainText("1 Sept");
});
