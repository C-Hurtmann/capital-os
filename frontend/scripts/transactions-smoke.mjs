/* global console, document, innerWidth, URLSearchParams */
import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "America/Los_Angeles",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173/");
  const first = page.waitForResponse(
    (r) => r.url().includes("/api/v1/transactions?") && r.status() === 200,
  );
  await page.getByRole("button", { name: "Transactions", exact: true }).click();
  const json = await (await first).json();
  await page.locator(".tx-table tbody tr").first().waitFor();
  if ((await page.locator(".tx-table tbody tr").count()) !== json.items.length)
    throw Error("Row count mismatch");
  await page.locator(".tx-row-link").first().click();
  if (
    !(await page
      .locator("#tx-details")
      .innerText()
      .then((t) => t.includes(json.items[0].bankId)))
  )
    throw Error("Bank ID mismatch");
  for (const width of [375, 900, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    if (
      !(await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ))
    )
      throw Error(`Overflow at ${width}`);
  }
  await page.screenshot({
    path: "test-results/transactions-real.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close transaction details" }).click();
  if (json.nextCursor) {
    const next = page.waitForResponse(
      (r) => r.url().includes("/api/v1/transactions?") && r.status() === 200,
    );
    await page.getByRole("button", { name: "View more", exact: true }).click();
    const batch = await (await next).json();
    await page.waitForFunction(
      (n) => document.querySelectorAll(".tx-table tbody tr").length === n,
      json.items.length + batch.items.length,
    );
    if (batch.computedAt !== json.computedAt) throw Error("Cutoff changed");
  }
  await page.getByLabel("Direction", { exact: true }).selectOption("income");
  const filtered = page.waitForResponse(
    (r) => r.url().includes("direction=income") && r.status() === 200,
  );
  await page.getByRole("button", { name: "Apply filters" }).click();
  const income = await (await filtered).json();
  if (income.items.some((t) => t.amountMinor <= 0))
    throw Error("Wrong direction");
  // Bounded read-only verification, never an automatic UI pagination policy.
  let batch = json,
    foreign = batch.items.find((t) => t.operationCurrencyCode !== 980),
    fee = batch.items.find((t) => t.commissionMinor !== 0);
  for (let i = 0; i < 200 && batch.nextCursor && (!foreign || !fee); i++) {
    const response = await page.request.get(
      "http://127.0.0.1:5173/api/v1/transactions?" +
        new URLSearchParams({ limit: "20", cursor: batch.nextCursor }),
    );
    if (response.status() !== 200) throw Error("Sample traversal failed");
    batch = await response.json();
    foreign ??= batch.items.find((t) => t.operationCurrencyCode !== 980);
    fee ??= batch.items.find((t) => t.commissionMinor !== 0);
  }
  if (foreign) {
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Kyiv",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(foreign.occurredAt));
    await page.getByLabel("Direction", { exact: true }).selectOption("");
    await page.locator("#tx-to").fill(day);
    const response = page.waitForResponse(
      (r) => r.url().includes("/api/v1/transactions?") && r.status() === 200,
    );
    await page.getByRole("button", { name: "Apply filters" }).click();
    const dayData = await (await response).json();
    const index = dayData.items.findIndex((t) => t.bankId === foreign.bankId);
    if (index < 0)
      throw Error("Foreign fixture outside first day batch; inspect manually");
    await page.locator(".tx-row-link").nth(index).click();
    await page.waitForFunction(
      (id) => document.querySelector("#tx-details")?.textContent.includes(id),
      foreign.bankId,
    );
    console.log(
      JSON.stringify({
        foreignSample: {
          amountMinor: foreign.amountMinor,
          operationAmountMinor: foreign.operationAmountMinor,
          operationCurrencyCode: foreign.operationCurrencyCode,
        },
        recordedFeeSample: fee?.commissionMinor ?? null,
        detail: await page.locator("#tx-details dd").nth(1).innerText(),
      }),
    );
  }
  console.log(
    JSON.stringify({
      status: "PASS",
      firstRows: json.items.length,
      filteredRows: income.items.length,
      errors,
    }),
  );
  if (errors.length) throw Error("Browser errors");
} finally {
  await browser.close();
}
