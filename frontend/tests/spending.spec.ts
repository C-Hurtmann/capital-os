import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
for (const width of [375, 1440])
  test(`donut without legend or selector at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const chart = page.getByRole("group", {
      name: "Spending categories",
      exact: true,
    });
    await expect(chart).toBeVisible();
    await expect(
      page.getByText("Explore category", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.locator(".spending-legend, .spending-explore"),
    ).toHaveCount(0);
    await chart.scrollIntoViewIfNeeded();
    const monthly = (await page.locator(".resource-monthly").boundingBox())!
      .height;
    const height = (await page.locator(".spending-panel").boundingBox())!
      .height;
    const others = page.getByRole("button", { name: /^Others,/ });
    await others.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("list", { name: "Categories in Others" }),
    ).toContainText("Uncategorized");
    expect((await page.locator(".spending-panel").boundingBox())!.height).toBe(
      height,
    );
    expect(
      (await page.locator(".resource-monthly").boundingBox())!.height,
    ).toBe(monthly);
    await page.keyboard.press("Escape");
    await expect(others).toBeFocused();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    const groceries = page.getByRole("button", { name: /^Groceries,/ });
    await groceries.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Groceries" })).toContainText(
      "Supermarkets",
    );
    expect(
      (
        await new AxeBuilder({ page })
          .include(".spending-panel")
          .include(".spending-explanation")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.keyboard.press("Escape");
    await page.mouse.move(0, 0);
    await page
      .locator(".spending-panel")
      .screenshot({ path: `test-results/donut-final-${width}.png` });
  });
