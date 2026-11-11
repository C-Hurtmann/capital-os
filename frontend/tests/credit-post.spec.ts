import { test, expect, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test.use({
  baseURL: "http://127.0.0.1:5178",
  timezoneId: "America/Los_Angeles",
});
const saved = { amountMinor: 123456, effectiveFrom: "2026-10-15T09:00:00Z" };
const endpoint = "**/api/v1/credit-limit";
async function openEditor(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Edit limit", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}
test("Now sends only exact amount, commits response without GET and isolates demo storage", async ({
  page,
}) => {
  let gets = 0;
  const posts: unknown[] = [];
  await page.addInitScript(() =>
    localStorage.setItem("capital-demo-credit-limit", "999"),
  );
  await page.route(endpoint, async (route) => {
    if (route.request().method() === "GET") {
      gets++;
      await route.fulfill({ json: saved });
    } else {
      posts.push(route.request().postDataJSON());
      await route.fulfill({
        json: {
          amountMinor: Number.MAX_SAFE_INTEGER,
          effectiveFrom: "2026-11-03T16:00:00Z",
        },
      });
    }
  });
  await openEditor(page);
  await expect(
    page.getByLabel("Credit limit · UAH", { exact: true }),
  ).toHaveValue("1234.56");
  await expect(
    page.getByRole("radio", { name: "Now — server time" }),
  ).toBeChecked();
  await expect(page.locator(".credit-confirmed")).toContainText("15 Oct 2026");
  await page
    .getByLabel("Credit limit · UAH", { exact: true })
    .fill("90071992547409.92");
  await page.getByRole("button", { name: "Save limit", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "exceeds",
  );
  expect(posts).toHaveLength(0);
  await page
    .getByLabel("Credit limit · UAH", { exact: true })
    .fill("90071992547409.91");
  const before = gets;
  await page.getByRole("button", { name: "Save limit", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(posts).toEqual([{ amountMinor: Number.MAX_SAFE_INTEGER }]);
  expect(gets).toBe(before);
  await expect(page.locator(".limit-row")).toContainText(
    "90,071,992,547,409.91",
  );
  expect(
    await page.evaluate(() =>
      localStorage.getItem("capital-demo-credit-limit"),
    ),
  ).toBe("999");
  await page.getByRole("button", { name: "Edit limit", exact: true }).click();
  await expect(
    page.getByLabel("Credit limit · UAH", { exact: true }),
  ).toHaveValue("90071992547409.91");
});
test("Kyiv manual time resolves DST and does not inherit browser timezone or saved date", async ({
  page,
}) => {
  let request: unknown;
  await page.route(endpoint, async (route) => {
    if (route.request().method() === "GET")
      await route.fulfill({ json: saved });
    else {
      request = route.request().postDataJSON();
      await route.fulfill({
        json: { amountMinor: 123456, effectiveFrom: "2026-10-25T01:30:00Z" },
      });
    }
  });
  await openEditor(page);
  await page.getByRole("radio", { name: "Specify date and time" }).check();
  const date = page.getByLabel("Effective date and time · Europe/Kyiv", {
    exact: true,
  });
  await expect(date).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Save limit", exact: true }),
  ).toBeDisabled();
  await date.fill("2026-03-29T03:30");
  await expect(page.getByText(/This local time does not exist/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save limit", exact: true }),
  ).toBeDisabled();
  await date.fill("2026-10-25T03:30");
  await expect(
    page.getByRole("button", { name: "Save limit", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("UTC offset for repeated time")
    .selectOption("2026-10-25T03:30:00+02:00");
  await page.getByRole("button", { name: "Save limit", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(request).toEqual({
    amountMinor: 123456,
    effectiveFrom: "2026-10-25T03:30:00+02:00",
  });
  await page.getByRole("button", { name: "Edit limit", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "Now — server time" }),
  ).toBeChecked();
});
test("switching Specify back to Now omits the date even for unchanged amount", async ({
  page,
}) => {
  let request: unknown;
  await page.route(endpoint, async (route) => {
    if (route.request().method() === "GET")
      await route.fulfill({ json: saved });
    else {
      request = route.request().postDataJSON();
      await route.fulfill({
        json: { ...saved, effectiveFrom: "2026-11-03T16:00:00Z" },
      });
    }
  });
  await openEditor(page);
  await page.getByRole("radio", { name: "Specify date and time" }).check();
  await page
    .getByLabel("Effective date and time · Europe/Kyiv", { exact: true })
    .fill("2026-10-15T12:00");
  await page.getByRole("radio", { name: "Now — server time" }).check();
  await page.getByRole("button", { name: "Save limit", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(request).toEqual({ amountMinor: 123456 });
});
test("save locks editing/closing, ignores older GET and blocks new GET while pending", async ({
  page,
}) => {
  let gets = 0,
    posts = 0;
  let oldGet: Route | undefined, post: Route | undefined;
  let holdReads = false;
  await page.route(endpoint, async (route) => {
    if (route.request().method() === "GET") {
      gets++;
      if (!holdReads) await route.fulfill({ json: saved });
      else oldGet = route;
    } else {
      posts++;
      post = route;
    }
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Edit limit", exact: true }),
  ).toBeEnabled();
  holdReads = true;
  await page.getByRole("button", { name: "Reload data", exact: true }).click();
  await expect.poll(() => !!oldGet).toBe(true);
  const getsBeforeSave = gets;
  await page.getByRole("button", { name: "Edit limit", exact: true }).click();
  await page.getByLabel("Credit limit · UAH", { exact: true }).fill("50000");
  await page.getByRole("button", { name: "Save limit", exact: true }).click();
  await expect.poll(() => !!post).toBe(true);
  await expect(
    page.getByLabel("Credit limit · UAH", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Close credit limit editor" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .locator(".credit-drawer form")
    .evaluate((form: HTMLFormElement) => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
  // Programmatic background refresh while modal is open still must not issue GET.
  await page.locator(".refresh").evaluate((button: HTMLButtonElement) => {
    button.disabled = false;
    button.click();
  });
  expect(posts).toBe(1);
  expect(gets).toBe(getsBeforeSave);
  await post!.fulfill({
    json: { amountMinor: 5000000, effectiveFrom: "2026-11-03T16:00:00Z" },
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await oldGet!
    .fulfill({ json: { amountMinor: 1, effectiveFrom: saved.effectiveFrom } })
    .catch(() => {});
  await expect(page.locator(".limit-row")).toContainText("50,000.00");
  expect(gets).toBe(getsBeforeSave);
});
for (const outcome of ["network", "503", "malformed"] as const)
  test(`uncertain ${outcome} keeps draft and offers manual GET without retry`, async ({
    page,
  }) => {
    let posts = 0,
      checked = false;
    await page.route(endpoint, async (route) => {
      if (route.request().method() === "GET")
        await route.fulfill({
          json: checked
            ? { amountMinor: 5000000, effectiveFrom: "2026-11-03T16:00:00Z" }
            : saved,
        });
      else {
        posts++;
        if (outcome === "network") await route.abort();
        else if (outcome === "503")
          await route.fulfill({
            status: 503,
            contentType: "application/problem+json",
            json: { requestId: "req-save", detail: "private trace" },
          });
        else
          await route.fulfill({
            json: { amountMinor: null, effectiveFrom: null },
          });
      }
    });
    await openEditor(page);
    await page.getByLabel("Credit limit · UAH", { exact: true }).fill("50000");
    await page.getByRole("button", { name: "Save limit", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "Could not confirm",
    );
    await expect(
      page.getByLabel("Credit limit · UAH", { exact: true }),
    ).toHaveValue("50000");
    await expect(page.locator(".limit-row")).toContainText("1,234.56");
    await expect(page.getByText("private trace")).toHaveCount(0);
    checked = true;
    await page
      .getByRole("button", { name: "Check current value", exact: true })
      .click();
    await expect(page.locator(".credit-confirmed")).toContainText("50,000.00");
    await expect(
      page.getByLabel("Credit limit · UAH", { exact: true }),
    ).toHaveValue("50000");
    expect(posts).toBe(1);
    await expect(page.getByRole("dialog")).toBeVisible();
  });
test("server future-date rejection preserves draft and request reference", async ({
  page,
}) => {
  await page.route(endpoint, async (route) => {
    if (route.request().method() === "GET")
      await route.fulfill({ json: saved });
    else
      await route.fulfill({
        status: 422,
        contentType: "application/problem+json",
        json: { requestId: "req-future" },
      });
  });
  await openEditor(page);
  await page.getByRole("radio", { name: "Specify date and time" }).check();
  await page
    .getByLabel("Effective date and time · Europe/Kyiv", { exact: true })
    .fill("2099-10-15T12:00");
  await page.getByRole("button", { name: "Save limit", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "req-future",
  );
  await expect(
    page.getByRole("button", { name: "Check current value", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Effective date and time · Europe/Kyiv", { exact: true }),
  ).toHaveValue("2099-10-15T12:00");
});
for (const width of [375, 1440])
  test(`editor accessibility and layout ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route(endpoint, (route) => route.fulfill({ json: saved }));
    await openEditor(page);
    await page.getByRole("radio", { name: "Specify date and time" }).check();
    await page
      .getByLabel("Effective date and time · Europe/Kyiv", { exact: true })
      .fill("2026-10-25T03:30");
    expect(
      (
        await new AxeBuilder({ page })
          .include(".credit-drawer")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page
        .locator(".credit-drawer")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/credit-editor-${width}.png`,
      fullPage: true,
    });
  });

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/balance", (route) =>
    route.fulfill({
      json: {
        bankBalanceMinor: 7000000,
        ownFundsMinor: 2000000,
        creditUsedMinor: 0,
        fetchedAt: "2026-11-04T06:00:00Z",
      },
    }),
  );
});

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/cashflow/current", (r) =>
    r.fulfill({
      json: {
        from: "2026-11-01",
        to: "2026-11-11",
        timeZone: "Europe/Kyiv",
        currency: "UAH",
        incomeMinor: 100,
        expenseMinor: 0,
        netMinor: 100,
        computedAt: "2026-11-11T12:00:00Z",
      },
    }),
  );
});
