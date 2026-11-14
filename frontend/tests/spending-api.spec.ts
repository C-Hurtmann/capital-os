import { test, expect, type Route } from "@playwright/test";
import { spendingFixture as data } from "./spendingFixture";
import { monthlyFixture } from "./monthlyFixture";
import { historyFixture } from "./historyFixture";
test.use({
  baseURL: "http://127.0.0.1:5178",
  timezoneId: "America/Los_Angeles",
});
const endpoint = "**/api/v1/spending/categories";
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
        ...data,
        incomeMinor: 100000,
        expenseMinor: data.totalMinor,
        netMinor: 100000 - data.totalMinor,
      },
    }),
  );
  await page.route("**/api/v1/cashflow/monthly", (r) =>
    r.fulfill({ json: monthlyFixture }),
  );
  await page.route("**/api/v1/balance-history?*", (r) =>
    r.fulfill({ json: historyFixture() }),
  );
});
test("live DTO replaces demo, uses display catalogue and exact cutoff", async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route(endpoint, (r) => {
    requests.push(
      r.request().method() + " " + new URL(r.request().url()).pathname,
    );
    return r.fulfill({ json: data });
  });
  await page.goto("/");
  const card = page.locator(".spending-panel");
  await expect(card.locator(".spending-center strong")).toHaveText(
    "UAH 599.00",
  );
  await expect(card).not.toContainText("Demo data");
  await expect(card.locator("time")).toHaveAttribute(
    "datetime",
    data.computedAt,
  );
  await expect(card.locator(".eyebrow")).toContainText("1 Nov – 14 Nov");
  await expect(
    card.getByRole("button", { name: /^Uncategorized,/ }),
  ).toBeVisible();
  await expect(card.locator("select")).toHaveCount(0);
  await expect(card.locator(".spending-legend")).toHaveCount(0);
  expect(requests.every((r) => r === "GET /api/v1/spending/categories")).toBe(
    true,
  );
  await page.evaluate(() =>
    window.dispatchEvent(new Event("capital-category-change")),
  );
  const count = requests.length;
  await page.waitForTimeout(200);
  expect(requests).toHaveLength(count);
});
test("loading never shows fake zero and zero success is empty", async ({
  page,
}) => {
  let ready = false;
  const held: Route[] = [];
  await page.route(endpoint, (r) =>
    ready
      ? r.fulfill({ json: { ...data, totalMinor: 0, categories: [] } })
      : held.push(r),
  );
  await page.goto("/");
  await expect(page.locator(".resource-spending")).toContainText(
    "Loading spending",
  );
  await expect(page.locator(".spending-center")).toHaveCount(0);
  ready = true;
  for (const r of held)
    await r
      .fulfill({ json: { ...data, totalMinor: 0, categories: [] } })
      .catch(() => {});
  await expect(page.locator(".spending-panel")).toContainText(
    "No spending this month",
  );
  await expect(page.locator(".spending-center strong")).toHaveText("UAH 0.00");
});
for (const status of [500, 503])
  test(`HTTP ${status} isolates error and retries`, async ({ page }) => {
    let failed = true;
    await page.route(endpoint, (r) =>
      failed
        ? r.fulfill({
            status,
            contentType: "application/problem+json",
            body: JSON.stringify({ requestId: "spending-ref" }),
          })
        : r.fulfill({ json: data }),
    );
    await page.goto("/");
    await expect(page.locator(".resource-spending [role=alert]")).toContainText(
      "spending-ref",
    );
    await expect(page.locator(".spending-center")).toHaveCount(0);
    await expect(page.locator(".net-card")).toContainText("401.00");
    failed = false;
    await page
      .getByRole("button", { name: "Retry spending", exact: true })
      .click();
    await expect(page.locator(".spending-center strong")).toHaveText(
      "UAH 599.00",
    );
  });
test("invalid new-month response and network failure preserve the whole old resource", async ({
  page,
}) => {
  let state = "ok";
  const old = {
    ...data,
    from: "2026-10-01",
    to: "2026-10-31",
    computedAt: "2026-10-31T12:00:00Z",
  };
  await page.route(endpoint, (r) =>
    state === "ok"
      ? r.fulfill({ json: old })
      : state === "network"
        ? r.abort()
        : r.fulfill({
            json: {
              ...data,
              totalMinor: 100,
              categories: [{ id: "new_category", amountMinor: 100 }],
            },
          }),
  );
  await page.goto("/");
  await expect(page.locator(".spending-center strong")).toHaveText(
    "UAH 599.00",
  );
  state = "invalid";
  await page.getByRole("button", { name: "Reload data", exact: true }).click();
  await expect(page.locator(".resource-spending [role=alert]")).toContainText(
    "Invalid spending response",
  );
  await expect(page.locator(".spending-panel time")).toHaveAttribute(
    "datetime",
    old.computedAt,
  );
  await expect(page.locator(".spending-panel .eyebrow")).toContainText(
    "1 Oct – 31 Oct",
  );
  state = "network";
  await page
    .getByRole("button", { name: "Retry spending", exact: true })
    .click();
  await expect(page.locator(".resource-spending [role=alert]")).toContainText(
    "Showing previously loaded data",
  );
  await expect(page.locator(".spending-center strong")).toHaveText(
    "UAH 599.00",
  );
  state = "ok";
  await page
    .getByRole("button", { name: "Retry spending", exact: true })
    .click();
  await expect(page.locator(".resource-spending [role=alert]")).toHaveCount(0);
});
test("malformed success is not accepted; response after navigation cannot overwrite new data", async ({
  page,
}) => {
  let state = "bad";
  const held: Route[] = [];
  await page.route(endpoint, (r) =>
    state === "bad"
      ? r.fulfill({ body: "broken", contentType: "application/json" })
      : state === "hold"
        ? held.push(r)
        : r.fulfill({ json: data }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Retry spending", exact: true }),
  ).toBeVisible();
  state = "hold";
  await page
    .getByRole("button", { name: "Retry spending", exact: true })
    .click();
  await expect.poll(() => held.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Transactions", exact: true }).click();
  const count = held.length;
  await page.waitForTimeout(100);
  expect(held.length).toBe(count);
  state = "ok";
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.locator(".spending-center strong")).toHaveText(
    "UAH 599.00",
  );
  for (const r of held)
    await r
      .fulfill({
        json: {
          ...data,
          totalMinor: 1,
          categories: [{ id: "other", amountMinor: 1 }],
        },
      })
      .catch(() => {});
  await expect(page.locator(".spending-center strong")).toHaveText(
    "UAH 599.00",
  );
});
