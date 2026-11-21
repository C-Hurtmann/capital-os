import { test, expect, type Route } from "@playwright/test";

test.use({ baseURL: "http://127.0.0.1:5178" });
test("initial skeletons resolve independently and never cover confirmed data", async ({
  page,
}) => {
  let hold = true;
  const pending: Route[] = [];
  const balance = {
    bankBalanceMinor: 123456,
    ownFundsMinor: null,
    creditUsedMinor: null,
    fetchedAt: "2026-11-21T08:00:00Z",
  };
  async function respond(r: Route) {
    if (new URL(r.request().url()).pathname === "/api/v1/balance")
      await r.fulfill({ json: balance });
    else await r.fulfill({ status: 503, body: "Unavailable" });
  }
  await page.route("**/api/v1/**", (r) => {
    if (hold) {
      pending.push(r);
      return;
    }
    return respond(r);
  });
  await page.goto("/");
  await expect(page.locator(".skeleton-amount")).toHaveCount(2);
  await expect(page.locator(".dashboard-skeleton-plot")).toHaveCount(3);
  await expect(page.locator(".balance")).not.toContainText(
    "Estimate unavailable",
  );
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".skeleton-amount")
      .first()
      .evaluate((e) => getComputedStyle(e, "::after").animationName),
  ).toBe("none");
  await page.screenshot({
    path: "test-results/dashboard-skeleton.png",
    fullPage: true,
  });
  hold = false;
  await Promise.all(pending.splice(0).map((r) => respond(r).catch(() => {})));
  await expect(page.locator(".balance > strong")).toContainText("1,234.56");
  await expect(page.locator(".dashboard-skeleton")).toHaveCount(0);
  hold = true;
  await page.getByRole("button", { name: "Reload data", exact: true }).click();
  await expect(page.locator(".balance")).toContainText(
    "Updating… Previous values shown.",
  );
  await expect(page.locator(".balance > strong")).toContainText("1,234.56");
  await expect(
    page.locator(".balance > strong .dashboard-skeleton"),
  ).toHaveCount(0);
  hold = false;
  await Promise.all(pending.splice(0).map((r) => respond(r).catch(() => {})));
});
