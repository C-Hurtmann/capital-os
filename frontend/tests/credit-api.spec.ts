import { test, expect } from "@playwright/test";
test.use({ baseURL: "http://127.0.0.1:5178" });
test("API zero replaces demo storage, editor is available and other widgets remain independent", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("capital-demo-credit-limit", "123456"),
  );
  await page.route("**/api/v1/credit-limit", async (route) => {
    expect(route.request().method()).toBe("GET");
    await route.fulfill({
      json: { amountMinor: 0, effectiveFrom: "2026-11-02T12:00:00Z" },
    });
  });
  await page.goto("/");
  await expect(page.locator(".limit-row")).toContainText("0.00");
  await expect(page.getByRole("button", { name: "Edit limit" })).toBeEnabled();
  await expect(page.getByLabel("Explore category")).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("capital-demo-credit-limit"),
    ),
  ).toBe("123456");
});
test("gateway error keeps other widgets usable and retry accepts unset", async ({
  page,
}) => {
  let retry = false;
  await page.route("**/api/v1/credit-limit", async (route) => {
    if (retry)
      await route.fulfill({ json: { amountMinor: null, effectiveFrom: null } });
    else
      await route.fulfill({
        status: 502,
        contentType: "text/html",
        body: "private gateway diagnostics",
      });
  });
  await page.goto("/");
  await expect(page.getByLabel("Explore category")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry credit limit", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".limit-row")).toContainText("Unavailable");
  await expect(page.getByText("private gateway diagnostics")).toHaveCount(0);
  retry = true;
  await page
    .getByRole("button", { name: "Retry credit limit", exact: true })
    .click();
  await expect(page.locator(".limit-row")).toContainText("Not set");
});

test("positive limit loads only on the dashboard without unnecessary requests", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/v1/credit-limit", async (route) => {
    requests++;
    expect(route.request().method()).toBe("GET");
    await route.fulfill({
      json: { amountMinor: 1500000, effectiveFrom: "2026-11-03T09:00:00Z" },
    });
  });
  await page.goto("/");
  await expect(page.locator(".limit-row")).toContainText("15,000.00");
  await page.getByRole("button", { name: "Transactions", exact: true }).click();
  const before = requests;
  await page.getByRole("button", { name: "Refresh demo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Refresh demo", exact: true }),
  ).toBeEnabled();
  expect(requests).toBe(before);
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect.poll(() => requests).toBeGreaterThan(before);
  await expect(page.locator(".limit-row")).toContainText("15,000.00");
});
