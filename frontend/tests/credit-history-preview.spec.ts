import { test, expect } from "@playwright/test";
test("history preview adds exact amounts, rejects duplicates and removes with review", async ({
  page,
}) => {
  const writes: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET" && r.url().includes("/api/")) writes.push(r.url());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Add past record", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Credit limit · UAH").fill("0.00");
  await dialog.getByLabel("Start date", { exact: true }).fill("2026-10-01");
  await dialog.getByRole("button", { name: "Review change" }).click();
  await expect(dialog.getByRole("alert")).toContainText("already exists");
  await dialog.getByLabel("Start date", { exact: true }).fill("2026-10-10");
  await dialog.getByRole("button", { name: "Review change" }).click();
  await expect(
    dialog.getByRole("region", { name: "Change impact" }),
  ).toContainText("2026-10-15");
  await dialog.getByRole("button", { name: "Save limit", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page
      .getByRole("row")
      .filter({
        has: page.getByRole("button", {
          name: "Edit record 2026-10-10",
          exact: true,
        }),
      }),
  ).toContainText("0.00");
  await page.getByRole("button", { name: "Remove record 2026-10-10" }).click();
  await dialog.getByRole("button", { name: "Review change" }).click();
  await dialog.getByRole("button", { name: "Confirm removal" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit record 2026-10-10", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Preview on Dashboard" }).click();
  await expect(
    page.getByText("Start date: 2026-10-15", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Mock preview · Solid:", { exact: false }),
  ).toBeVisible();
  expect(writes).toEqual([]);
});
test("mobile settings and editor fit viewport and preserve draft on back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit record 2026-10-15", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Credit limit · UAH").fill("90071992547409.91");
  await dialog.getByRole("button", { name: "Review change" }).click();
  await expect(
    dialog.getByRole("heading", { name: "Review history change" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Back", exact: true }).click();
  await expect(dialog.getByLabel("Credit limit · UAH")).toHaveValue(
    "90071992547409.91",
  );
  const rect = await dialog.boundingBox();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "test-results/credit-history-mobile.png",
    fullPage: true,
  });
});
