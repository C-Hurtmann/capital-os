# Capital OS frontend — v0.9 review build

English-only, Graphite / Forest, one synthetic Monobank UAH account. This is an interactive frontend proposal for review, not a production bank connection. Credit Limit GET/POST use the approved local API contract.

## Run

Use Node >=22.13 in Linux/WSL; the repository .nvmrc pins the tested Node 22.21.1. Run `nvm install` once if that version is missing, then `nvm use`. The root `make frontend` target loads nvm automatically when installed in ~/.nvm, including when launched from an IDE. Do not share node_modules between Windows and Linux.

```sh
cd /home/czagorodnyi/projects/capital-os/frontend
nvm use
npm ci
npm run dev
```

Open http://localhost:5173. The synthetic snapshot is fixed to 29 October 2026, with history beginning January 2025. It does not reproduce the user's 2,177 real transactions.

## Included

- Spacious dashboard composition, dark graphite surfaces and forest main card.
- Current Balance and Actual Monthly Net Cashflow, with labeled green income and red expenses.
- Independent Balance History range: 1M / 3M / 6M / 12M / All. Three months is a review default, not a newly approved product decision.
- Last 12 calendar months including the partial current month; current-month categories with selectable donut and exact values.
- Transactions: date, absolute UAH amount, direction and category filters; 20-row pagination; operation details and immutable bank MCC; original EUR amounts for synthetic foreign purchases.
- Category overrides and manually entered current credit limit persist locally. Saving categories updates category analytics without changing bank amounts or balances.
- Refresh demo and offline failure state retain displayed data. Neither action contacts Monobank.

## Financial behavior

All positive UAH movements count as income, all negative movements count as expenses, including outgoing card transfers. No cashflow exclusions. Refunds are ordinary positive movements. Money uses integer minor units; addition rejects unsafe integers. Original operation currencies are metadata and never added to UAH analytics. No separately invented fee is added. Unknown history before January 2025 is rejected rather than fabricated. Credit split is explicitly unknown pending bank balance semantics; entering a limit does not assert a split or alter the historical graph.

## Review boundaries

Google Sign-In and real session handling are not implemented. No fake Google authentication is presented. Bank synchronization, server persistence, source freshness and production error recovery require backend integration. This build deliberately does not call the obsolete proposed dashboard endpoint or interpret it as approved. Setting the earlier VITE_DATA_SOURCE=http no longer enables that adapter. API design remains a separate review step.

The fixed category list is provisional and includes Credit. Final tokens, mobile details, donut interaction and the default history period remain review proposals. Budget planning, Planned Balance, portfolio, installments, historical credit limits and chart reordering are excluded.

## Architecture

React + strict TypeScript + Vite, Recharts, Lucide, plain CSS. No new dependencies. App composes dashboard/navigation; Charts exposes independent history/spending/monthly components; Transactions owns filters and operation-detail state; mockResources supplies independent asynchronous widget data; data owns synthetic fixtures and aggregates. useWidget manages per-widget requests and rejects cancelled responses; it is not a cache. Browser storage contains only demo overrides and the entered limit, never tokens. The current two-view navigation is a review implementation; URL routing/session integration should be agreed for production.

## Checks

```sh
npm run build
npm run lint
npm test
npm run format:check
npx playwright install chromium
npm run test:e2e
```

Browser tests exercise responsive overflow, axe checks, independent history ranges, category persistence and offline refresh. Screenshots are in ignored test-results/review-{width}.png. Browser and automated accessibility coverage do not establish full WCAG conformance.

docs/api-contract-proposal.md distinguishes approved architecture/credit GET from pending contracts. The demo view model is not an approved REST schema.

## Local credit-limit GET/POST integration

Default `npm run dev` remains fully synthetic. Run `npm run dev:api` to read and set the current credit limit from the local FastAPI at `http://127.0.0.1:8001`. Stop the previous frontend server first to keep port 5173, or pass `-- --port 5174 --strictPort` for a separate local preview.

Vite proxies `/api` to port 8001; override with `CAPITAL_API_TARGET` when needed. Browser requests stay relative (`/api/v1/credit-limit`); no backend CORS change is needed. Only the existing credit-limit row uses the backend; all other widgets remain synthetic. No API requests are made for the credit limit while Transactions is active, including its Refresh action. Returning to Dashboard reloads it.

The typed client validates null/zero/positive and UTC timestamps. A failed GET never falls back to demo localStorage. Existing demo editing remains demo-only. API editing uses POST, never PUT. Now mode omits effectiveFrom; Specify date and time resolves Europe/Kyiv offsets and requires a choice for repeated DST times. Saved dates are displayed separately; each opening starts in Now mode. Decimal strings are converted with BigInt, including the safe-integer boundary. Saves block editing/closing and invalidate older GETs. There are no automatic POST retries. Uncertain outcomes retain the draft and offer a manual Check current value GET. This is a local development integration; public authentication remains outside this change.

The history cache is awaiting https://trello.com/c/3P9yMUG7. Demo preset boundaries and 3M default are fixtures, not settled calendar rules. No Custom Range remains in history; transaction dates remain available.

## Local balance integration

`npm run dev:api` now enables both GET balance and credit-limit GET/POST through the existing proxy. `GET /api/v1/balance` is the sole source for the current bank balance, own funds and credit used in this mode. Other analytics remain synthetic; `npm run dev` remains demo-only. No bank synchronization is initiated by Reload data or Retry balance.

The client validates safe integer amounts and UTC fetchedAt at runtime. The card formats amounts exactly in UAH and displays fetchedAt including date, time and UTC, never the page load time. Missing estimates show Estimate unavailable; initial errors show Unavailable, not zero. Refresh errors retain the last successfully loaded snapshot and its original timestamp. No age threshold is invented: the bank retrieval time is always visible. State is held by the existing useWidget hook, with cancellation and independent retry. Successful credit-limit edits reread the balance to obtain backend-calculated estimates without any frontend financial calculations.

Verification: unit and browser coverage includes own funds, credit usage, null estimates, negative balance, 503, fetchedAt across browser timezones, loading and retry with retained data. Real backend smoke must be repeated when local FastAPI on port 8001 is running.

Root `make dev` / `make frontend` starts the local API frontend (balance and credit limit). Use `make frontend-demo` or `npm run dev` for the isolated synthetic demo. Restart an already running Vite process after changing its mode; refresh alone does not switch modes.

## Current-month cashflow — local API

`make frontend` / `npm run dev:api` also connects the existing KPI to `GET /api/v1/cashflow/current`. Independent CashflowResponse has no coverage/asOf; runtime validation checks safe-integer totals, signs, net invariant, calendar dates and Europe/Kyiv period against the server cutoff. computedAt is labelled Calculated, never bank freshness. Old totals retain their original dates and calculation time during failed refresh. Dashboard entry and Reload data fetch the resource; Transactions does not. Demo remains synthetic, and the 12-month trend is not integrated by this change.

Verified 11 November 2026: 100 unit tests, 34 browser tests, lint and build passed. Real browser GET through Vite to FastAPI/DynamoDB Local returned incomeMinor=1147253, expenseMinor=3873988, netMinor=-2726735; displayed values and period/cutoff matched. No bank sync or data mutation. Playwright demo server uses isolated port 5177, API tests use 5178, leaving interactive port 5173 available.

## Monthly cashflow — integrated 11 November 2026

Approved contract: https://trello.com/c/4de2GaE0. Local API mode uses GET /api/v1/cashflow/monthly for Monthly Income & Expenses. Dedicated MonthlyCashflowResponse validates 12 consecutive ordered months, safe nonnegative integers, UTC cutoff and its Kyiv date range. No coverage/asOf or frontend aggregation. Empty months remain zero-height bars with all 12 axis labels; keyboard tooltip exposes exact values. A completely zero chart remains successful. Period and partial-month label come from the saved response, with computedAt labelled Calculated. Existing useWidget retains old values/metadata on errors and cancels obsolete reads. Demo remains available; history and categories still use demo data.

Verification: 126 unit tests, full 38-browser-test suite, lint/build passed. Real Chromium/Vite/FastAPI smoke returned 200 for 2025-12-01 through 2026-11-11, exactly 12 months; period/cutoff and keyboard tooltip matched server data. No bank sync or writes. Final zero-axis adjustment also passed the four monthly browser tests. Production authentication is outside this integration.

## Balance History — integrated 12 November 2026

Local API mode reads `/api/v1/balance-history?preset=3M` by default. Presets 1M/3M/6M/12M use Kyiv calendar months including the current partial month; All begins at the first transaction. Separate BalanceHistoryResponse validates UTC cutoff, calendar boundaries, ordered unique dates, safe signed balances, one optional leading null sentinel and dense daily known points. Empty All supports from:null; successful empty data displays No data. Numeric calendar-day X coordinates preserve gaps without browser timezone shifts. No backward fill, client-info substitution or credit overlay.

A single in-memory response supports covered narrower presets; canonical All also supports a leading-unknown fixed view. Cache is scoped to this mounted frontend/source, not persisted. Explicit Reload/Retry clears reusable data before fetching. Changed Kyiv date prevents reuse. Aborted responses cannot repopulate it. `capital-transactions-synced` invalidates history and reloads when enabled; this is an integration seam, not an implemented bank-sync notification transport. TTL/source freshness and cross-widget synchronization remain separate decisions. Authentication/logout integration remains separate; the cache must be cleared or its owner unmounted when that is added.

Verified: 158 unit tests and 43 browser tests. Real browser GET through Vite/FastAPI: 3M 2026-09-01..2026-11-12 (73 points), All 2025-01-01..2026-11-12 (681 points). All points matched a direct backend GET; All/3M overlap matched, tooltip matched its selected API point, All->3M reused the response without another GET. No bank synchronization or data writes.

### Spending donut mock review — 13 November 2026

The donut uses the designer-approved 39-category English display catalogue and ID-keyed palette in `src/categoryCatalogue.ts`. Static descriptions live in the frontend; this is not an MCC mapping or a new API contract. `loadSpending` supplies a synthetic category distribution scaled with integer arithmetic to the existing demo monthly expense total. In local-api mode the category widget remains explicitly labelled Demo data and does not represent real bank transactions.

`src/spending.ts` validates totals and groups strictly below 3% (at least two eligible categories, except 1–3 positive categories), caps at eight sectors and always places synthetic Others last. Source `other` remains Uncategorized. Exact BigInt arithmetic is used for grouping and rounded percentage display; SVG geometry alone uses floating-point ratios. All members remain available in the expandable legend.

`src/SpendingChart.tsx` provides keyboard/touch selection, independent information buttons, hover/focus explanations and pinned popovers with Escape/outside-click handling. Popovers do not change layout, and may scroll at constrained viewport heights. Real category API integration and the backend MCC mapping remain separate work.

Donut review correction: the visible bottom legend was removed at the user's request. A compact category selector includes grouped categories under Inside Others; the Others information popover shows the breakdown without changing card height. The neighbouring monthly chart does not stretch to match the donut. This supersedes the expandable inline legend described above.

Final demo approval: the user approved removing both the legend and the entire Explore category block. Categories are accessed directly through donut sectors (pointer, touch, Tab + Enter/Space); Others opens its breakdown in an overlay. This supersedes the compact selector proposal above. No financial API or MCC mapping approval is implied.

### Real Spending GET integration — 14 November 2026

`local-api` now loads `GET /api/v1/spending/categories` through the existing `/api` Vite proxy (no query/body). `VITE_SPENDING_SOURCE=api` enables this resource separately; demo remains the default outside local-api. `SpendingResponse` is the approved v0.3 DTO, independent of the former mock coverage model.

`src/spendingApi.ts` validates required values, UTC cutoff / Kyiv month dates, literal currency/timezone, the approved 39 IDs, uniqueness, positive safe amounts, ordering and exact BigInt total before updating state. Unknown API IDs fail this widget; they are never remapped to Uncategorized. The backend owns MCC classification; frontend copy, palette and Others grouping remain unchanged.

The existing `useWidget` handles independent loading, retry, stale resource retention and aborted/late responses. Requests are enabled on Dashboard only; demo category-edit events do not reload the live resource. Old metadata stays with old data after errors, including month rollover. Retry reads stored transactions and never invokes bank sync. The card displays its server calculation cutoff, not bank freshness. No legend, Explore category or new financial calculations were introduced.

Verification: 249 unit tests and 51 browser tests passed; build and lint passed. Read-only local smoke through the Vite proxy/FastAPI rendered 14 real categories as 8 sectors. A separate read-only process froze both service clocks at `2026-11-14T15:48:16.712Z` against DynamoDB Local: spending total = exact category sum = cashflow expenses = 4,384,238 kopecks. No persisted bank data was changed. Production authentication and deployment remain outside this local integration.
