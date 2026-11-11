import { test, expect, type Route } from "@playwright/test";
import { monthlyFixture as data } from "./monthlyFixture";
test.use({
  baseURL: "http://127.0.0.1:5178",
  timezoneId: "America/Los_Angeles",
});
const endpoint = "**/api/v1/cashflow/monthly";
test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/balance", (r) =>
    r.fulfill({
      json: {
        bankBalanceMinor: 100,
        ownFundsMinor: null,
        creditUsedMinor: null,
        fetchedAt: data.computedAt,
      },
    }),
  );
  await page.route("**/api/v1/credit-limit", (r) =>
    r.fulfill({ json: { amountMinor: null, effectiveFrom: null } }),
  );
  await page.route("**/api/v1/cashflow/current", (r) =>
    r.fulfill({
      json: {
        from: "2026-11-01",
        to: data.to,
        timeZone: data.timeZone,
        currency: data.currency,
        computedAt: data.computedAt,
        incomeMinor: 0,
        expenseMinor: 0,
        netMinor: 0,
      },
    }),
  );
});
for (const width of [375, 1440])
  test(`zero months retain all labels and keyboard tooltip at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route(endpoint, (r) => r.fulfill({ json: data }));
    await page.goto("/");
    await expect(
      page.locator(".monthly .recharts-xAxis .recharts-cartesian-axis-tick"),
    ).toHaveCount(12);
    await expect(page.locator(".monthly time")).toHaveAttribute(
      "datetime",
      data.computedAt,
    );
    await expect(page.locator(".monthly")).toContainText(
      "2025-12-01 – 2026-11-11",
    );
    const chart = page.locator(".monthly [role=application]");
    await chart.focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      page.locator(".monthly .recharts-tooltip-wrapper"),
    ).toContainText("0.00");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/monthly-${width}.png`,
      fullPage: true,
    });
  });
test("503 retry and failed refresh preserve period; malformed is rejected", async ({
  page,
}) => {
  let mode = "error";
  await page.route(endpoint, (r) =>
    mode === "error"
      ? r.fulfill({ status: 503, body: "private" })
      : r.fulfill({
          json: mode === "invalid" ? { ...data, months: [] } : data,
        }),
  );
  await page.goto("/");
  const retry = page.getByRole("button", {
    name: "Retry monthly cashflow",
    exact: true,
  });
  await expect(retry).toBeVisible();
  mode = "ok";
  await retry.click();
  await expect(page.locator(".monthly time")).toBeVisible();
  mode = "invalid";
  await page.getByRole("button", { name: "Reload data", exact: true }).click();
  await expect(page.locator(".resource-monthly")).toContainText(
    "Showing previously loaded data.",
  );
  await expect(page.locator(".monthly time")).toHaveAttribute(
    "datetime",
    data.computedAt,
  );
});
test("loading and late GET do not replace newer data", async ({ page }) => {
  let hold = true;
  let pending: Route | undefined;
  await page.route(endpoint, (r) => {
    if (hold) {
      pending = r;
      return;
    }
    return r.fulfill({ json: data });
  });
  await page.goto("/");
  await expect(page.locator(".resource-monthly")).toContainText(
    "Loading monthly cashflow",
  );
  await expect.poll(() => !!pending).toBe(true);
  const old = pending!;
  await page.getByRole("button", { name: "Transactions", exact: true }).click();
  hold = false;
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.locator(".monthly time")).toBeVisible();
  await old.fulfill({ json: { ...data, to: "bad" } }).catch(() => {});
  await expect(page.locator(".resource-monthly [role=alert]")).toHaveCount(0);
});
