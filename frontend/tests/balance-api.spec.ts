import { monthlyFixture } from "./monthlyFixture";
import { test, expect } from "@playwright/test";
test.use({
  baseURL: "http://127.0.0.1:5178",
  timezoneId: "America/Los_Angeles",
});
const endpoint = "**/api/v1/balance";
const saved = {
  bankBalanceMinor: 7000000,
  ownFundsMinor: 2000000,
  creditUsedMinor: 0,
  fetchedAt: "2026-11-04T06:00:00Z",
};
test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/credit-limit", (r) =>
    r.fulfill({ json: { amountMinor: null, effectiveFrom: null } }),
  );
});
for (const [name, values, total, split] of [
  ["own funds", saved, "70,000.00", "20,000.00 / UAH 0.00"],
  [
    "credit used",
    {
      ...saved,
      bankBalanceMinor: 1000000,
      ownFundsMinor: 0,
      creditUsedMinor: 4000000,
    },
    "10,000.00",
    "0.00 / UAH 40,000.00",
  ],
  [
    "unknown estimate",
    { ...saved, ownFundsMinor: null, creditUsedMinor: null },
    "70,000.00",
    "Estimate unavailable",
  ],
  [
    "negative balance",
    {
      ...saved,
      bankBalanceMinor: -12345,
      ownFundsMinor: 0,
      creditUsedMinor: 512345,
    },
    "-UAH 123.45",
    "0.00 / UAH 5,123.45",
  ],
] as const)
  test(`renders ${name} and bank timestamp`, async ({ page }) => {
    await page.route(endpoint, (r) => r.fulfill({ json: values }));
    await page.goto("/");
    await expect(page.locator(".balance > strong")).toContainText(total);
    await expect(page.locator(".balance-detail")).toContainText(split);
    await expect(page.locator(".balance time")).toHaveAttribute(
      "datetime",
      saved.fetchedAt,
    );
    await expect(page.locator(".balance time")).toHaveText(
      "04 Nov 2026, 06:00:00 UTC",
    );
  });
test("503 has no fake zero; retry loads snapshot independently", async ({
  page,
}) => {
  let fail = true;
  await page.route(endpoint, (r) =>
    fail
      ? r.fulfill({ status: 503, json: { detail: "private" } })
      : r.fulfill({ json: saved }),
  );
  await page.goto("/");
  await expect(page.locator(".balance > strong")).toHaveText("Unavailable");
  await expect(page.getByLabel("Explore category")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry balance", exact: true }),
  ).toBeVisible();
  fail = false;
  await page
    .getByRole("button", { name: "Retry balance", exact: true })
    .click();
  await expect(page.locator(".balance > strong")).toContainText("70,000.00");
});
test("failed refresh retains snapshot and fetchedAt; retry never syncs bank", async ({
  page,
}) => {
  let fail = false;
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/"))
      requests.push(r.method() + " " + new URL(r.url()).pathname);
  });
  await page.route(endpoint, (r) =>
    fail ? r.abort() : r.fulfill({ json: saved }),
  );
  await page.goto("/");
  await expect(page.locator(".balance > strong")).toContainText("70,000.00");
  fail = true;
  await page.getByRole("button", { name: "Reload data", exact: true }).click();
  await expect(page.locator(".balance")).toContainText(
    "Showing previously loaded data.",
  );
  await expect(page.locator(".balance > strong")).toContainText("70,000.00");
  await expect(page.locator(".balance time")).toHaveAttribute(
    "datetime",
    saved.fetchedAt,
  );
  fail = false;
  await page
    .getByRole("button", { name: "Retry balance", exact: true })
    .click();
  await expect(page.locator(".balance [role=alert]")).toHaveCount(0);
  expect(
    requests.every(
      (r) =>
        r === "GET /api/v1/balance" ||
        r === "GET /api/v1/credit-limit" ||
        r === "GET /api/v1/cashflow/current" ||
        r === "GET /api/v1/cashflow/monthly",
    ),
  ).toBe(true);
});
test("initial loading does not substitute demo balance", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route(endpoint, async (r) => {
    await gate;
    await r.fulfill({ json: saved });
  });
  await page.goto("/");
  await expect(page.locator(".balance")).toContainText("Loading balance…");
  await expect(page.locator(".balance > strong")).toHaveText("Unavailable");
  release();
  await expect(page.locator(".balance > strong")).toContainText("70,000.00");
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

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/cashflow/monthly", (r) =>
    r.fulfill({ json: monthlyFixture }),
  );
});
