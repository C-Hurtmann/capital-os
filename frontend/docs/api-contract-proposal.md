# Capital OS — API agreement status

Updated 2026-11-03. Supersedes the 2026-10-31 Hybrid proposal. Approval of one endpoint does not approve other contracts.

## Approved architecture

Independent resource-oriented GET; no required `/api/v1/dashboard`, BFF or global atomic snapshot. Proposed analytical paths: `/api/v1/balance`, `/api/v1/cashflow`, `/api/v1/monthly-cashflow`, `/api/v1/spending`, `/api/v1/balance-history`. Each DTO requires separate review before real integration.

Backend owns financial aggregation, sign rules, effective categories and calendar boundaries in `Europe/Kyiv`, including DST. Current cashflow and spending use the current calendar month. Monthly trend includes the last 12 months, including the current partial month. Responses must identify the actual calculation period and distinguish unknown coverage from confirmed zero.

One FastAPI Lambda with Mangum and API Gateway HTTP API; separate background functions. MVP analytics use DynamoDB Query/GetItem and Python calculations without persisted aggregates. Internal PK/SK never become frontend contract requirements.

## Approved GET credit-limit

`GET /api/v1/credit-limit`, HTTP 200:

```ts
type CreditLimitResponse =
  | { amountMinor: number; effectiveFrom: string }
  | { amountMinor: null; effectiveFrom: null };
```

Both fields required. Both null means unset; zero with timestamp is an explicitly set zero. Amount is a nonnegative safe integer in UAH kopecks. Timestamp is valid UTC and means start of validity, not fetch time or revision. No accountId, version or If-Match. Runtime validation is implemented.

Fetch where consumed: the current UI displays the limit on the dashboard, so it loads on entry. Local API mode supports the approved POST editor. Demo storage is separate and never receives server data.

## Approved errors and widget behavior

Application errors use RFC 9457 `application/problem+json`: type, title, status, detail, requestId. Credit-limit POST maps 400/415/422/503/500; infrastructure responses may be non-JSON. Other resource mappings require separate agreement. Client tolerates non-JSON infrastructure errors and does not display raw bodies. Unset limit is 200, never 404.

Each widget loads and retries independently. Background refresh preserves previous data, actual period and freshness labels. Unknown is not zero. A failing resource does not hide other resources. No global Promise.all gate. UI state details remain subject to designer review.

## History periods and cache — implementation boundary

Only 1M, 3M, 6M, 12M, All. No Custom or date picker for history. Default and exact calendar meaning of presets remain pending; demo uses fixed fixture ranges and temporary 3M default. Transaction date filters are unaffected. Request representation (preset vs from/to) is not approved.

Wide-range reuse and freshness-before-width are approved principles. Detailed algorithm is pending: https://trello.com/c/3P9yMUG7. No history range cache is implemented yet.

Frontend proposal: backend provides resolved preset boundaries and enough daily/interval coverage to describe a sliced range. Agree source freshness, rollover and when post-sync reads are current. Local request cancellation protects against obsolete UI responses but cannot establish backend freshness. Do not silently merge old wide data with newer narrow data. Session/account isolation and logout invalidation must accompany auth integration.

## Authentication and future contracts

Cognito, Google Sign-In and JWT API authorization are approved. Registration, allowlist, bank onboarding, credential handling and frontend auth flow are paused. No hardcoded email or invented cookie-session contract. Production deployment is not part of this change.

Transactions, categories, mutations, synchronization, status codes and the full invalidation matrix each require separate contract review. Older proposals for mandatory revisions, If-Match, snapshot cursors and OAuth callback routes are not approved requirements.

## Current implementation

`contracts.ts` separates synthetic demo types, provisional widget view models and the approved credit-limit DTO. `mockResources.ts` simulates independent resources. Its calendar fixtures and aggregation are demo-only, not production financial logic. Components consume prepared results. `creditLimit.ts` provides opt-in same-origin GET/POST integration; no other unapproved endpoints are called. No new dependencies or cache framework.

## Approved POST credit-limit — local integration

`POST /api/v1/credit-limit` accepts `{ amountMinor, effectiveFrom? }`. Amount is a strict integer from zero through Number.MAX_SAFE_INTEGER. Explicit null, unknown fields and implicit coercion are forbidden. effectiveFrom is an optional timezone-aware RFC 3339 timestamp; the backend rejects future instants. Omission assigns current server UTC time even for an unchanged amount. HTTP 200 returns both fields non-null, timestamp in UTC. No history, version, optimistic locking or automatic POST retry.

The editor opens in Now mode with no editable date prefilled. Saved effective date is shown separately. Manual input uses Europe/Kyiv regardless of browser timezone: nonexistent times are rejected and repeated times require an offset choice. Monetary strings use exact BigInt conversion. POST response validation precedes committing state and closing. Active saves block editing, closing, duplicates and new GETs; earlier GET responses are invalidated. Errors preserve draft and confirmed state; uncertain network/timeout/malformed success/5xx outcomes offer a manual GET check. That check cannot prove a timed-out request has stopped executing.

Verification on 2026-11-03: 56 unit tests and 23 browser tests passed, including DST, safe-integer limits, request ordering, error recovery, demo isolation and accessibility checks. Lint, build and formatting passed. A real Chromium session through Vite proxy to local FastAPI saved amountMinor=0 with 2026-10-15T12:00:00+03:00, received 2026-10-15T09:00:00Z, then saved zero in Now mode and received 2026-11-03T16:29:59.464000Z. Subsequent GETs matched both persisted responses. Local data now contains an explicitly set zero; it was initially unset. This is not a production-ready/authenticated deployment.

## Current-month cashflow — approved and integrated 11 November 2026

Canonical contract: https://trello.com/c/1hxgaeET. GET /api/v1/cashflow/current returns from/to (Kyiv dates), timeZone Europe/Kyiv, currency UAH, non-null safe integer incomeMinor/expenseMinor/netMinor and UTC computedAt. Expenses are positive magnitude; net is signed. One captured cutoff defines both the calculation window and returned month. No coverage or asOf in this resource. HTTP 503 for storage failures, 500 for invalid aggregates; zero totals describe stored operations only. The independent frontend KPI consumes this DTO without changing shared PeriodMeta or integrating the 12-month chart. Calculation time is not bank freshness.

## Monthly cashflow — integrated 11 November 2026

Approved contract: https://trello.com/c/4de2GaE0. Local API mode uses GET /api/v1/cashflow/monthly for Monthly Income & Expenses. Dedicated MonthlyCashflowResponse validates 12 consecutive ordered months, safe nonnegative integers, UTC cutoff and its Kyiv date range. No coverage/asOf or frontend aggregation. Empty months remain zero-height bars with all 12 axis labels; keyboard tooltip exposes exact values. A completely zero chart remains successful. Period and partial-month label come from the saved response, with computedAt labelled Calculated. Existing useWidget retains old values/metadata on errors and cancels obsolete reads. Demo remains available; history and categories still use demo data.

Verification: 126 unit tests, full 38-browser-test suite, lint/build passed. Real Chromium/Vite/FastAPI smoke returned 200 for 2025-12-01 through 2026-11-11, exactly 12 months; period/cutoff and keyboard tooltip matched server data. No bank sync or writes. Final zero-axis adjustment also passed the four monthly browser tests. Production authentication is outside this integration.

## Balance History — approved contract / local integration 12 November 2026

Canonical contract https://trello.com/c/1ztR5mCl; frontend task https://trello.com/c/H70rFe18. GET /api/v1/balance-history accepts case-sensitive preset 1M/3M/6M/12M/All, omitted default 3M. Response contains only from/to/computedAt/timeZone/currency/points; from null only for empty All. Calendar presets, leading sentinel, dense carry-forward after first known date and uncapped All supersede the earlier provisional history DTO/default sections above. Backend owns daily balances. Frontend parses and slices returned points without financial reconstruction. Calculation cutoff is not bank freshness. Numeric time-aware X-axis and independent resource state are integrated; advanced cache/freshness coordination remains separate.
