import { historyFixture } from "./historyFixture";
import { monthlyFixture } from "./monthlyFixture";
import { test, expect, type Route } from "@playwright/test";
test.use({
  baseURL: "http://127.0.0.1:5178",
  timezoneId: "America/Los_Angeles",
});
const data = {
  from: "2026-11-01",
  to: "2026-11-11",
  timeZone: "Europe/Kyiv",
  currency: "UAH",
  incomeMinor: 1147253,
  expenseMinor: 3873988,
  netMinor: -2726735,
  computedAt: "2026-11-11T12:21:05.534000Z",
};
const endpoint = "**/api/v1/cashflow/current";
test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/balance", (r) =>
    r.fulfill({
      json: {
        bankBalanceMinor: 10000,
        ownFundsMinor: null,
        creditUsedMinor: null,
        fetchedAt: data.computedAt,
      },
    }),
  );
  await page.route("**/api/v1/credit-limit", (r) =>
    r.fulfill({ json: { amountMinor: null, effectiveFrom: null } }),
  );
});
test("real mode renders signed totals, period and calculation time", async ({
  page,
}) => {
  await page.route(endpoint, (r) => r.fulfill({ json: data }));
  await page.goto("/");
  await expect(page.locator(".net-card > strong")).toContainText("27,267.35");
  await expect(page.locator(".net-card > strong")).toHaveClass("negative");
  await expect(page.locator(".cashflow-rows")).toContainText("11,472.53");
  await expect(page.locator(".cashflow-rows")).toContainText("38,739.88");
  await expect(page.locator(".net-card")).toContainText(
    "2026-11-01 – 2026-11-11",
  );
  await expect(page.locator(".net-card time")).toHaveAttribute(
    "datetime",
    data.computedAt,
  );
  await expect(page.locator(".net-card")).toContainText(
    "Calculated 11 Nov 2026, 12:21:05 UTC",
  );
});
test("503 retries to zero observed totals without claiming no activity", async ({
  page,
}) => {
  let fail = true;
  await page.route(endpoint, (r) =>
    fail
      ? r.fulfill({ status: 503, body: "private" })
      : r.fulfill({
          json: { ...data, incomeMinor: 0, expenseMinor: 0, netMinor: 0 },
        }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Retry cashflow", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".net-card > strong")).toHaveText("Unavailable");
  await expect(
    page.getByRole("group", { name: "Spending categories", exact: true }),
  ).toBeVisible();
  fail = false;
  await page
    .getByRole("button", { name: "Retry cashflow", exact: true })
    .click();
  await expect(page.locator(".net-card > strong")).toContainText("0.00");
  await expect(page.locator(".net-card")).not.toContainText("No transactions");
});
test("failed or malformed refresh preserves original period and totals", async ({
  page,
}) => {
  let fail = false;
  await page.route(endpoint, (r) =>
    r.fulfill({ json: fail ? { ...data, netMinor: null } : data }),
  );
  await page.goto("/");
  await expect(page.locator(".net-card time")).toBeVisible();
  fail = true;
  await page.getByRole("button", { name: "Reload data", exact: true }).click();
  await expect(page.locator(".net-card")).toContainText(
    "Showing previously loaded data.",
  );
  await expect(page.locator(".net-card > strong")).toContainText("27,267.35");
  await expect(page.locator(".net-card time")).toHaveAttribute(
    "datetime",
    data.computedAt,
  );
});
test("loading, navigation and late GET protection", async ({ page }) => {
  let hold = true;
  let pending: Route | undefined;
  await page.route(endpoint, async (r) => {
    if (hold) pending = r;
    else
      await r.fulfill({
        json: { ...data, incomeMinor: 100, expenseMinor: 0, netMinor: 100 },
      });
  });
  await page.goto("/");
  await expect(page.locator(".net-card")).toContainText("Loading cashflow");
  await expect.poll(() => !!pending).toBe(true);
  const old = pending!;
  await page.getByRole("button", { name: "Transactions", exact: true }).click();
  hold = false;
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.locator(".net-card > strong")).toContainText("1.00");
  await old.fulfill({ json: data }).catch(() => {});
  await expect(page.locator(".net-card > strong")).toContainText("1.00");
});

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/cashflow/monthly", (r) =>
    r.fulfill({ json: monthlyFixture }),
  );
});

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/balance-history?*", (r) =>
    r.fulfill({
      json: historyFixture(
        new URL(r.request().url()).searchParams.get("preset") || "3M",
      ),
    }),
  );
});
