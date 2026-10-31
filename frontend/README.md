# Capital OS frontend — v0.9 review build

English-only, Graphite / Forest, one synthetic Monobank UAH account. This is an interactive frontend proposal for review, not a production bank connection or an approved REST integration.

## Run

Use Node >=22.13 in Linux/WSL. Do not share node_modules between Windows and Linux.

```sh
cd /home/czagorodnyi/projects/capital-os/frontend
npm ci
npm run dev
```

Open http://localhost:5173. The synthetic snapshot is fixed to 29 October 2026, with history beginning January 2025. It does not reproduce the user's 2,177 real transactions.

## Included

- Spacious dashboard composition, dark graphite surfaces and forest main card.
- Current Balance and Actual Monthly Net Cashflow, with labeled green income and red expenses.
- Independent Balance History range: 3 / 6 months, 1 year, All, Custom. Three months is a review default, not a newly approved product decision.
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

React + strict TypeScript + Vite, Recharts, Lucide, plain CSS. No new dependencies. App composes dashboard/navigation; Charts is lazy-loaded; Transactions owns filters and operation-detail state; data owns synthetic fixtures and aggregates. Browser storage contains only demo overrides and the entered limit, never tokens. The current two-view navigation is a review implementation; URL routing/session integration should be agreed for production.

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

The updated API proposal in docs/api-contract-proposal.md covers the current MVP and remains PROPOSED. The demo view model is not an approved REST schema.
