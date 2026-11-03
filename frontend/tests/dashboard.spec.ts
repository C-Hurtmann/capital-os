import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
for (const width of [375, 768, 1440, 1920])
  test(`review layout ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Balance History" }),
    ).toBeVisible();
    await expect(page.getByLabel("Explore category")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: `test-results/review-${width}.png`,
      fullPage: true,
    });
  });
test("history selection leaves current-month figures unchanged", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Balance History" }),
  ).toBeVisible();
  await expect(page.getByLabel("Explore category")).toBeVisible();
  const monthly = await page.locator(".net-card").textContent();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.locator(".net-card")).toHaveText(monthly!);
  await page.getByLabel("Explore category").selectOption("credit");
  await expect(
    page.getByRole("button", { name: "Custom", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "1M", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".donut-label")).toContainText("Credit");
});
test("transaction filters and persistent categorization preserve bank values", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Transactions", exact: true }).click();
  await page.locator(".transaction-row").first().click();
  const amount = await page
    .locator(".transaction-detail dd")
    .nth(2)
    .innerText();
  await page.locator(".transaction-detail select").selectOption("credit");
  await page
    .getByRole("button", { name: "Save category", exact: true })
    .click();
  await expect(
    page.getByText("Category saved on this device.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".transaction-detail dd").nth(2)).toHaveText(
    amount,
  );
  await page.reload();
  await page.getByRole("button", { name: "Transactions", exact: true }).click();
  await expect(page.locator(".transaction-row").first()).toContainText(
    "Credit",
  );
  await page.getByLabel("Direction", { exact: true }).selectOption("expense");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.locator(".transaction-row").first()).toContainText(
    "Expense",
  );
});
test("failed refresh retains previously loaded data", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Balance History" }),
  ).toBeVisible();
  const value = await page.locator(".metric.balance>strong").innerText();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Refresh demo", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText(
    "Refresh failed",
  );
  await expect(page.locator(".metric.balance>strong")).toHaveText(value);
});

test("credit drawer preserves card geometry and restores focus", async ({
  page,
}) => {
  await page.goto("/");
  const card = page.locator(".metric.balance");
  await expect(page.getByRole("button", { name: "Edit limit" })).toBeEnabled();
  const before = await card.boundingBox();
  await page.getByRole("button", { name: "Edit limit" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await card.boundingBox()).toEqual(before);
  await page.getByLabel("Credit limit · UAH").fill("50000");
  await page.getByRole("button", { name: "Save limit", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(card).toContainText("50,000.00");
  await page.getByRole("button", { name: "Edit limit" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Edit limit" })).toBeFocused();
  await expect(page.getByText("View data table")).toHaveCount(0);
});

test("history errors and retries are isolated and retain the actual old interval", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Explore category")).toBeVisible();
  const monthly = await page.locator(".net-card").textContent();
  const oldPeriod = await page.locator(".range-label").textContent();
  await context.setOffline(true);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Retry history", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".range-label")).toHaveText(oldPeriod!);
  await expect(page.locator(".net-card")).toHaveText(monthly!);
  await expect(
    page.getByRole("button", { name: "Retry cashflow", exact: true }),
  ).toHaveCount(0);
  await context.setOffline(false);
  await page
    .getByRole("button", { name: "Retry history", exact: true })
    .click();
  await expect(page.locator(".range-label")).toContainText("1 Jan");
  await page.getByRole("button", { name: "12M", exact: true }).click();
  await page.getByRole("button", { name: "1M", exact: true }).click();
  await expect(page.locator(".range-label")).toContainText("1 Oct");
});
test("malformed credit value fails independently and never becomes zero", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("capital-demo-credit-limit", "broken"),
  );
  await page.goto("/");
  await expect(page.getByLabel("Explore category")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry credit limit", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".limit-row")).toContainText("Unavailable");
  await page.evaluate(() =>
    localStorage.setItem("capital-demo-credit-limit", "0"),
  );
  await page
    .getByRole("button", { name: "Retry credit limit", exact: true })
    .click();
  await expect(page.locator(".limit-row")).toContainText("0.00");
  await expect(page.locator(".limit-row")).not.toContainText("Not set");
});
