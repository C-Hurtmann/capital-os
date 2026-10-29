import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
for (const width of [375, 768, 1440, 1920]) {
  test(`dashboard responsive and accessible at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Динаміка балансу" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("heading", { name: "На що йдуть кошти" }),
    ).toBeVisible();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(result.violations).toEqual([]);
    await page.screenshot({
      path: `test-results/dashboard-${width}.png`,
      fullPage: true,
    });
  });
}
test("period, account, category and empty state interactions", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Динаміка балансу" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "3 місяці", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "3 місяці", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("heading", { name: "Динаміка балансу" }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Рахунок" }).selectOption("white");
  await expect(
    page.getByRole("heading", { name: "Динаміка балансу" }),
  ).toBeVisible();
  await page.locator(".category-list button").first().click();
  await expect(page.locator(".category-list button").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Свій період", exact: true }).click();
  await page.getByLabel("Від", { exact: true }).fill("2025-12-01");
  await page.getByLabel("До", { exact: true }).fill("2025-12-05");
  await page.getByRole("button", { name: "Застосувати" }).click();
  await expect(
    page.getByText("За обраний період операцій немає.", { exact: false }),
  ).toBeVisible();
});
test("keyboard access and recovery from data failure", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Перейти до огляду" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Динаміка балансу" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Свій період", exact: true }).click();
  await page.getByLabel("Від", { exact: true }).fill("2026-10-20");
  await page.getByLabel("До", { exact: true }).fill("2026-10-01");
  await page.getByRole("button", { name: "Застосувати" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByLabel("Від", { exact: true }).fill("2026-10-01");
  await page.getByRole("button", { name: "Застосувати" }).click();
  await expect(
    page.getByRole("heading", { name: "Динаміка балансу" }),
  ).toBeVisible();
});
