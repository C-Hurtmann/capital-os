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
