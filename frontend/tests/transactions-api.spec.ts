import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test.use({
  baseURL: "http://127.0.0.1:5178",
  timezoneId: "America/Los_Angeles",
});
const endpoint = "**/api/v1/transactions?*";
const item = {
  bankId: "b",
  occurredAt: "2026-11-14T23:30:00Z",
  amountMinor: -199,
  operationAmountMinor: -12999,
  operationCurrencyCode: 999,
  balanceMinor: -100,
  mcc: 5411,
  commissionMinor: 0,
  categoryId: "groceries",
};
const data = {
  computedAt: "2026-11-15T12:00:00Z",
  timeZone: "Europe/Kyiv",
  currency: "UAH",
  items: [item],
  nextCursor: "cursor-1",
};
async function open(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Transactions", exact: true }).click();
}
test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/**", (r) =>
    r.fulfill({ status: 503, body: "Unavailable" }),
  );
});
test("one-sided dates, zero amount, 422 recovery and unmounted late response", async ({
  page,
}) => {
  let reject = false,
    hold = false;
  let held: Route | undefined;
  const queries: URL[] = [];
  await page.route(endpoint, (r) => {
    queries.push(new URL(r.request().url()));
    if (hold) {
      held = r;
      return;
    }
    if (reject)
      return r.fulfill({
        status: 422,
        contentType: "application/problem+json",
        body: JSON.stringify({ requestId: "test-422" }),
      });
    return r.fulfill({
      json: {
        ...data,
        items: [{ ...item, amountMinor: 0, categoryId: null }],
        nextCursor: null,
      },
    });
  });
  await open(page);
  await expect(
    page.getByRole("button", { name: /View Zero-amount transaction/ }),
  ).toBeVisible();
  await page.locator("#tx-to").fill("2026-11-15");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.locator(".tx-applied")).toContainText("To 2026-11-15");
  expect(queries.at(-1)!.searchParams.has("from")).toBe(false);
  reject = true;
  await page.locator("#tx-from").fill("2026-11-01");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("alert")).toContainText("test-422");
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".tx-applied")).toContainText("Any start date");
  reject = false;
  hold = true;
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect.poll(() => !!held).toBe(true);
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  hold = false;
  await page.getByRole("button", { name: "Transactions", exact: true }).click();
  await expect(page.locator(".tx-table tbody tr")).toHaveCount(1);
  await held!
    .fulfill({ json: { ...data, items: [], nextCursor: null } })
    .catch(() => {});
  await expect(page.locator(".tx-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".tx-applied")).toContainText("Any start date");
});
test("demand driven, details, Kyiv, exact money, accessible responsive layout", async ({
  page,
}) => {
  let count = 0;
  await page.route(endpoint, (r) => {
    count++;
    return r.fulfill({ json: data });
  });
  await page.goto("/");
  expect(count).toBe(0);
  await page.getByRole("button", { name: "Transactions", exact: true }).click();
  await expect(page.locator(".tx-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".tx-table")).toContainText("15 Nov 2026");
  await expect(page.locator(".tx-table")).toContainText("01:30");
  await expect(page.locator(".tx-table")).toContainText("−1.99 UAH");
  expect(await page.locator(".tx-fields input").count()).toBe(2);
  const opener = page.getByRole("button", { name: /View Groceries/ });
  await opener.click();
  await expect(
    page.getByRole("button", { name: "Close transaction details" }),
  ).toBeFocused();
  await expect(page.locator("#tx-details")).toContainText(
    "-12,999 minor units · code 999",
  );
  for (const width of [375, 900, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const a = await new AxeBuilder({ page })
      .include(".tx-console")
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(a.violations).toEqual([]);
  }
  await page.screenshot({
    path: "test-results/transactions-details.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
});
test("append, double click guard, empty continuation and same-token retry", async ({
  page,
}) => {
  const calls: string[] = [];
  let fail = true;
  let held: Route | undefined;
  await page.route(endpoint, (r) => {
    const c = new URL(r.request().url()).searchParams.get("cursor") ?? "";
    calls.push(c);
    if (c === "") return r.fulfill({ json: data });
    if (c === "cursor-1") {
      held = r;
      return;
    }
    if (fail) return r.fulfill({ status: 503, body: "offline" });
    return r.fulfill({
      json: { ...data, items: [{ ...item, bankId: "a" }], nextCursor: null },
    });
  });
  await open(page);
  await page.getByRole("button", { name: "View more", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Loading more…" }),
  ).toBeDisabled();
  expect(calls.filter((c) => c === "cursor-1")).toHaveLength(1);
  await held!.fulfill({ json: { ...data, items: [], nextCursor: "cursor-2" } });
  await expect(page.locator(".tx-table tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Continue searching" }).click();
  await expect(page.getByRole("alert")).toContainText("503");
  fail = false;
  await page.getByRole("button", { name: "Retry loading more" }).click();
  await expect(page.locator(".tx-table tbody tr")).toHaveCount(2);
  await expect(page.getByText("End of results", { exact: true })).toBeVisible();
  expect(calls.slice(-2)).toEqual(["cursor-2", "cursor-2"]);
});
test("initial retry never flashes a terminal empty state", async ({ page }) => {
  let retry = false,
    held: Route | undefined;
  await page.route(endpoint, (r) => {
    if (!retry) return r.fulfill({ status: 503 });
    held = r;
  });
  await open(page);
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toBeVisible();
  retry = true;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Loading transactions…" }),
  ).toBeVisible();
  await expect(
    page.getByText("No transactions to show", { exact: true }),
  ).toHaveCount(0);
  await held!.fulfill({ json: { ...data, items: [], nextCursor: "next" } });
  await expect(
    page.getByRole("button", { name: "Continue searching" }),
  ).toBeVisible();
});
test("filter draft/applied, failure, retry, Clear and unsupported params", async ({
  page,
}) => {
  let fail = true;
  const urls: URL[] = [];
  await page.route(endpoint, (r) => {
    const u = new URL(r.request().url());
    urls.push(u);
    if (u.searchParams.has("direction") && fail)
      return r.fulfill({ status: 503 });
    return r.fulfill({
      json: u.searchParams.has("direction")
        ? { ...data, items: [], nextCursor: null }
        : data,
    });
  });
  await open(page);
  await expect(page.locator(".tx-table tbody tr")).toHaveCount(1);
  await page.getByLabel("Direction", { exact: true }).selectOption("income");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("alert")).toContainText("503");
  await expect(page.locator(".tx-applied")).toContainText("All directions");
  await expect(page.locator(".tx-table tbody tr")).toHaveCount(1);
  fail = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator(".tx-applied")).toContainText("income");
  await expect(
    page.getByText("No transactions to show", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.locator(".tx-table tbody tr")).toHaveCount(1);
  expect([...urls.at(-1)!.searchParams.keys()]).toEqual(["limit"]);
  await page.locator("#tx-from").fill("2026-11-15");
  await page.locator("#tx-to").fill("2026-11-14");
  const before = urls.length;
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.locator("#to-error")).toContainText("on or after");
  expect(urls).toHaveLength(before);
});
test("invalid append retains confirmed rows; refresh resets cursor", async ({
  page,
}) => {
  await page.route(endpoint, (r) => r.fulfill({ json: data }));
  await open(page);
  await page.getByRole("button", { name: "View more", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Invalid continuation");
  await expect(page.locator(".tx-table tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Refresh list" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
test("keyboard append reaches first new row; remount starts a fresh traversal", async ({
  page,
}) => {
  let held: Route | undefined;
  await page.route(endpoint, (r) => {
    if (new URL(r.request().url()).searchParams.has("cursor")) {
      held = r;
      return;
    }
    return r.fulfill({ json: data });
  });
  await open(page);
  const more = page.getByRole("button", { name: "View more", exact: true });
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Loading more…" }),
  ).toBeVisible();
  await held!.fulfill({
    json: { ...data, items: [{ ...item, bankId: "a" }], nextCursor: null },
  });
  await expect(page.locator(".tx-row-link").nth(1)).toBeFocused();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await open(page);
  await expect(page.locator(".tx-table tbody tr")).toHaveCount(1);
});
