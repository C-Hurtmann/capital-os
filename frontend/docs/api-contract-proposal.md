# Dashboard API contract proposal

Status: **PROPOSED**. No backend endpoint currently exists. This document is the single proposal and decision log. Runtime TypeScript shapes are in `src/contracts.ts`; they implement this provisional proposal, not a separately approved API. Updated: 2026-10-29.

## Required endpoint — PROPOSED

`GET /api/v1/dashboard`

One snapshot supplies account options, overview, daily balances, MCC category totals and monthly cashflow. This avoids four cold starts, inconsistent chart snapshots and downloading raw financial transactions. Backend owns aggregation, transfer reconciliation, MCC categorization, date bucketing and account balances. Frontend owns formatting, proportions, presentation and comparison percentages. No transaction-list or portfolio endpoints are needed for this MVP.

### Parameters

| Parameter | Type            | Required | Meaning                                                               |
| --------- | --------------- | -------- | --------------------------------------------------------------------- |
| from      | YYYY-MM-DD      | yes      | Inclusive start local calendar date                                   |
| to        | YYYY-MM-DD      | yes      | Inclusive end, not later than local today, at most 366 calendar dates |
| currency  | ISO 4217 string | yes      | UAH initially; selected account currency must match                   |
| timeZone  | IANA string     | yes      | Europe/Kyiv initially                                                 |
| accountId | opaque string   | no       | Omit for all eligible same-currency accounts                          |

Server converts calendar boundaries to [local start midnight, midnight after end), respecting DST. Never interpret `to` as UTC 23:59:59. Previous interval has exactly the same number of local calendar dates and ends immediately before `from`.

### Response schema

All fields below are required. `accountId` is the only optional request field. Empty collections use `[]`, never null. Monetary values are JSON safe integers in minor units; reject values beyond Number.MAX_SAFE_INTEGER. Currency is never inferred from a bank numeric code. `minorUnit` specifies the ISO currency exponent (UAH=2). Expenses and incomes are positive magnitudes; balances and net movement can be negative. No floats for financial computation.

```ts
interface Account {
  id: string;
  name: string;
  currency: string;
  balanceMinor: number;
}
interface Dashboard {
  currency: string;
  minorUnit: number;
  from: string;
  to: string; // YYYY-MM-DD, echoes effective interval
  asOf: string; // RFC3339 UTC instant, same snapshot for whole response
  accounts: Account[]; // ALL eligible accounts in requested currency for selector
  overview: {
    currentBalanceMinor: number; // selected accounts, asOf, independent of interval
    openingBalanceMinor: number; // immediately before from
    closingBalanceMinor: number; // end of to
    incomeMinor: number;
    expenseMinor: number;
    previousIncomeMinor: number;
    previousExpenseMinor: number;
  };
  timeline: { date: string; balanceMinor: number }[];
  categories: {
    id: string;
    label: string;
    mccCodes: string[];
    amountMinor: number;
  }[];
  months: { month: string; incomeMinor: number; expenseMinor: number }[];
}
```

Daily timeline is ascending, continuous and carries balances through days without activity. Opening balance must come from authoritative account history, not be inferred from a possibly incomplete first transaction. Monthly rows are ascending YYYY-MM; include zero months; boundary months contain only dates inside the interval. Categories are nonzero expense totals, sorted descending; each expense belongs to exactly one category including an Other fallback. Four-digit MCC codes are strings. Amounts must reconcile across categories, monthly rows and overview.

Matched internal transfers affect account balances but are excluded from income and expense totals even when filtering to one account. Actual fees remain expenses. Balance movement can therefore differ from net cashflow for a single account. Refund policy and unmatched transfer behavior require agreement (see questions).

### Example

`GET /api/v1/dashboard?from=2026-10-01&to=2026-10-02&currency=UAH&timeZone=Europe%2FKyiv`

```json
{
  "currency": "UAH",
  "minorUnit": 2,
  "from": "2026-10-01",
  "to": "2026-10-02",
  "asOf": "2026-10-29T18:30:00Z",
  "accounts": [
    {
      "id": "mono-black",
      "name": "monobank · Black",
      "currency": "UAH",
      "balanceMinor": 14500000
    }
  ],
  "overview": {
    "currentBalanceMinor": 14500000,
    "openingBalanceMinor": 10000000,
    "closingBalanceMinor": 10900000,
    "incomeMinor": 1000000,
    "expenseMinor": 100000,
    "previousIncomeMinor": 0,
    "previousExpenseMinor": 120000
  },
  "timeline": [
    { "date": "2026-10-01", "balanceMinor": 10950000 },
    { "date": "2026-10-02", "balanceMinor": 10900000 }
  ],
  "categories": [
    {
      "id": "groceries",
      "label": "Продукти",
      "mccCodes": ["5411"],
      "amountMinor": 100000
    }
  ],
  "months": [
    { "month": "2026-10", "incomeMinor": 1000000, "expenseMinor": 100000 }
  ]
}
```

No pagination: at most 366 daily points, 13 partial/full months and a bounded category list. A future raw transaction endpoint should use opaque DynamoDB cursor pagination; it is outside this proposal.

### Empty and error handling — PROPOSED

No activity: 200 with zero income/expenses, empty categories, carried daily balances and zero monthly rows. No connected accounts: 200 with accounts [], zero overview, continuous zero timeline and zero monthly series. Historical balances unavailable must be an explicit 409 error, never fabricated zeros. A future partial-source status extension needs agreement before use.

Errors use `application/problem+json` (RFC 9457): required `type` URI, `title` string, `status` integer, `detail` string, `requestId` string; optional `invalidParams: {name:string;reason:string}[]`.

```json
{
  "type": "https://capital-os.example/problems/invalid-range",
  "title": "Invalid date range",
  "status": 400,
  "detail": "from must not be after to",
  "requestId": "req-123",
  "invalidParams": [{ "name": "from", "reason": "after to" }]
}
```

400 invalid dates/currency/zone/range, 401 unauthenticated, 403 account inaccessible, 404 unknown account, 409 incomplete balance history, 429 throttled (Retry-After), 503 source unavailable. Do not return bank credentials or personal details in errors. Client displays a recoverable error and retries on user action, aborts superseded requests and never presents old results as a newly selected period. Current HTTP adapter displays safe status-based messages; structured field mapping is deferred until agreement.

## Tradeoffs and Lambda/DynamoDB considerations

Recommend one aggregate endpoint for a compact dashboard. Separate chart endpoints permit independent caches/loading but incur more requests and snapshot skew. Account metadata could be separate when other screens need it; currently repeat this tiny collection. Query partitions by account and time; avoid table scans. Backend can maintain per-day aggregates and balance checkpoints; aggregate requested ranges from these bounded records. DynamoDB has no arbitrary GROUP BY; read strategy and write aggregation belong to backend design. Do not introduce this infrastructure in frontend. Private responses should use Cache-Control: private, no-store initially. Consider ETag later only with a defined freshness policy. Auth must be agreed before deployment; same-origin adapter supports a future secure HttpOnly session cookie. Never ship bank tokens in Vite variables.

## Currency policy — PROPOSED

Never add different currencies. Initial UI selects only UAH accounts; no exchange-rate assumptions. Future currency selector filters accounts to one currency and sends currency. Converted net worth requires a separately agreed FX source, valuation instant and rounding rules. Account ID is opaque, never a card number.

## Open decisions for backend architect

1. Approve one aggregate endpoint, schemas, bounded intervals and no pagination?
2. Confirm local timezone, DST boundaries and equal-calendar-day comparison intervals.
3. Confirm balance snapshot completeness and `asOf` meaning with delayed Monobank sync.
4. Confirm transfer matching, unmatched transfers, commissions, refunds (net category spending versus separate positive income), reversals and credit limits. Proposed mock treats positive nontransfer amounts as income; refunds are not modeled.
5. Confirm native-currency filtering, no conversion and initial UAH-only UI.
6. Confirm same-origin authentication, CSRF strategy for future mutations, error schema and source freshness behavior.
7. Confirm accounts contains all eligible accounts while financial aggregates use selected accounts.

## Decision log

| Date       | Proposal                                              | Status   | Decision                            |
| ---------- | ----------------------------------------------------- | -------- | ----------------------------------- |
| 2026-10-29 | GET dashboard aggregate and monetary/date conventions | PROPOSED | Await user/backend architect review |
| 2026-10-29 | Native currency and transfer rules                    | PROPOSED | Await user/backend architect review |
| 2026-10-29 | Problem JSON and session integration                  | PROPOSED | Await user/backend architect review |

After agreement, update this log, `src/contracts.ts`, mock aggregation, adapter and semantic tests in one change. No proposal is APPROVED yet.
