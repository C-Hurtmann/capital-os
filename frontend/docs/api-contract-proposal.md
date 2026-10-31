# Capital OS — MVP REST API proposal

Status: **PROPOSED**, pending backend architecture review. Updated 2026-10-31. This document replaces the earlier global-period, multi-account proposal. Approved product/domain rules are not approval of these transport contracts. Existing src/contracts.ts describes the demo view model; it is not this proposed REST schema. No proposed endpoint is currently called by the review UI.

## Recommendation and alternatives

Recommend an aggregate dashboard for first load plus a separately retrievable balance history. One initial snapshot supplies independent-period blocks without multiple cold-start-sensitive round trips. Changing the history period retrieves only history. Separate endpoints per chart improve independent caching and failure isolation, but require more coordination and a shared revision to avoid mixed snapshots. Cold starts depend on Lambda deployment/reuse, not simply request count. A single endpoint on every history change is simpler but refetches unrelated monthly data. The recommended hybrid adds only one read route for a real interaction.

Backend owns financial aggregation, timezone boundaries, effective categorization, completeness and snapshots. Frontend formats amounts and percentages and manages interaction. Do not download all transactions just to compute dashboard totals. Query DynamoDB by bounded account/time ranges and/or aggregate records; avoid assuming arbitrary filters are efficient scans. PK/SK and LastEvaluatedKey never cross the API boundary directly.

## Shared semantics and TypeScript shapes

All money fields are signed JSON safe integers in minor units (UAH exponent 2). Income/expense aggregate magnitudes are nonnegative. Check individual values and aggregate sums against Number.MAX_SAFE_INTEGER on the server and at the client boundary; no floating-point financial arithmetic. Optional original-currency values require an ISO numeric code and explicit exponent. Never infer conversion from amount ratios. All operations affect cashflow by the sign of amountMinor, including card transfers; refunds are positive income. Fees already included in amountMinor must not be added again. Manual categories never change bank MCC, amount or balance.

Date is YYYY-MM-DD; Instant is RFC3339 UTC; month is YYYY-MM. Analytics timezone is fixed Europe/Kyiv. Inclusive from/to dates translate to [local midnight from, local midnight after to), including DST. Future dates and dates before available history are rejected. Monthly cards cover local month start through the snapshot instant. Twelve-month bars include the current partial month. UI must display each block's effective interval and timestamp.

```ts
type DateOnly = string;
type Instant = string;
type Minor = number;
type Coverage = "complete" | "partial" | "unavailable";
interface Period {
  from: DateOnly;
  to: DateOnly;
}
interface Meta {
  revision: string;
  asOf: Instant;
  timeZone: "Europe/Kyiv";
  currency: "UAH";
}
interface Category {
  id: string;
  name: string;
} // fixed catalogue, includes Credit
interface CurrentBalance {
  bankBalanceMinor: Minor | null;
  ownFundsMinor: Minor | null;
  creditUsedMinor: Minor | null;
  breakdownStatus: "known" | "unavailable";
  asOf: Instant | null;
}
interface CreditLimit {
  amountMinor: Minor | null;
  updatedAt: Instant | null;
  version: string;
}
interface History {
  meta: Meta;
  period: Period;
  availableFrom: DateOnly | null;
  coverage: Coverage;
  points: { date: DateOnly; balanceMinor: Minor | null }[];
}
interface Sync {
  state: "idle" | "queued" | "running" | "failed";
  lastSuccessfulAt: Instant | null;
  stale: boolean;
  jobId: string | null;
  error: { code: string; message: string } | null;
}
interface Dashboard {
  meta: Meta;
  balance: CurrentBalance;
  creditLimit: CreditLimit;
  sync: Sync;
  cashflow: {
    period: Period;
    coverage: Coverage;
    incomeMinor: Minor | null;
    expenseMinor: Minor | null;
    netMinor: Minor | null;
  };
  monthly: {
    period: Period;
    rows: {
      month: string;
      partialMonth: boolean;
      coverage: Coverage;
      incomeMinor: Minor | null;
      expenseMinor: Minor | null;
    }[];
  };
  spending: {
    period: Period;
    coverage: Coverage;
    totalMinor: Minor | null;
    categories: { categoryId: string; name: string; amountMinor: Minor }[];
  };
  history: History;
}
interface Transaction {
  id: string;
  bankId: string;
  timestamp: Instant;
  amountMinor: Minor;
  operationAmountMinor: Minor | null;
  operationCurrencyCode: number | null;
  operationMinorUnit: number | null;
  balanceMinor: Minor | null;
  mcc: string;
  categoryId: string;
  categorySource: "bank" | "manual";
  version: string;
  fee: { amountMinor: Minor; includedInAmount: boolean } | null;
}
interface Page {
  items: Transaction[];
  nextCursor: string | null;
  revision: string;
}
interface Problem {
  type: string;
  title: string;
  status: number;
  detail: string;
  requestId: string;
  invalidParams?: { name: string; reason: string }[];
}
```

Every field above is required unless marked ?. Null means unknown/unset, never zero. Zero means a confirmed zero. Unknown history points remain gaps; carry a balance only across confirmed days with no movements. Unknown/missing history is distinct from an empty filtered transaction list. Do not compute a credit split until bank balance semantics are agreed; return unavailable/null then. Credit-limit history is out of scope.

## Endpoint inventory — all PROPOSED

| Method/path                              | Request                                                                                                                      | Response and success                                    | Client behavior                                                                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| GET /api/v1/dashboard                    | historyFrom, historyTo required dates                                                                                        | 200 Dashboard                                           | First load; keep snapshot during background refresh; replace coherently                                            |
| GET /api/v1/balance-history              | from, to required dates                                                                                                      | 200 History                                             | Only history changes; cancel superseded reads; retain old graph labeled with old dates while loading               |
| GET /api/v1/categories                   | none                                                                                                                         | 200 {items:Category[],version:string}                   | Load fixed options; no creation UI                                                                                 |
| GET /api/v1/transactions                 | optional from,to,minAmountMinor,maxAmountMinor,categoryId,direction=income\|expense; limit default 50 max 100; cursor opaque | 200 Page                                                | New filters reset pagination; min/max are inclusive absolute UAH magnitudes                                        |
| GET /api/v1/transactions/{id}            | opaque public id                                                                                                             | 200 Transaction                                         | Direct detail/deep-link refresh; optional if list payload stays complete, retain only if routing requires it       |
| PATCH /api/v1/transactions/{id}/category | {categoryId:string}; If-Match: version                                                                                       | 200 Transaction, new version                            | Commit confirmed result; update detail/list; invalidate current-month spending when affected; preserve bank fields |
| GET /api/v1/credit-limit                 | none                                                                                                                         | 200 CreditLimit                                         | Drawer uses current value/version; no history                                                                      |
| PUT /api/v1/credit-limit                 | {amountMinor:Minor}; If-Match: version                                                                                       | 200 CreditLimit                                         | Keep drawer open on error; on success update limit and refetch balance breakdown if backend supports it            |
| GET /api/v1/sync                         | none                                                                                                                         | 200 Sync                                                | Server determines stale from source policy                                                                         |
| POST /api/v1/sync                        | empty object; Idempotency-Key                                                                                                | 202 {jobId:string,statusUrl:string}                     | Disable duplicate refresh; poll GET sync with backoff; terminal success refetch dashboard and loaded transactions  |
| GET /api/v1/session                      | none                                                                                                                         | 200 {user:{name:string,email:string},expiresAt:Instant} | Restore session before protected data                                                                              |
| GET /auth/google/start                   | optional allowlisted relative returnTo                                                                                       | 302 to Google                                           | Top-level browser navigation; server owns OAuth state/PKCE                                                         |
| GET /auth/google/callback                | provider code/state                                                                                                          | 303 to app or login error                               | Server verifies allowed identity and sets session cookie                                                           |
| POST /api/v1/logout                      | empty object, CSRF header                                                                                                    | 204                                                     | Clear all financial client cache and show sign-in                                                                  |

Session proposal: same-origin Secure HttpOnly SameSite cookie. Do not store OAuth/bank tokens in localStorage. Server enforces the single allowed identity for every endpoint. Mutations require agreed CSRF protection. Login failures display a safe reason (cancelled, expired, unauthorized account), never raw provider secrets. Callback is server-owned and not a frontend API fetch.

No pagination for dashboard/history (bounded by available history), categories or sync. Daily history currently fits the MVP history beginning Jan 2025; backend must agree a hard range/point cap rather than silently truncate. Transactions sort descending by timestamp with stable id tie-break; cursor is filter-bound, opaque, expiring and snapshot-aware. Avoid offset/page-count promises. If DynamoDB filters produce a short or empty page with a continuation cursor, client can continue; backend should bound evaluated work and state cursor behavior explicitly. No full-text search or fabricated merchant names.

## Examples

```http
GET /api/v1/dashboard?historyFrom=2026-08-01&historyTo=2026-10-29
GET /api/v1/balance-history?from=2025-01-01&to=2026-10-29
GET /api/v1/transactions?from=2026-10-01&to=2026-10-29&minAmountMinor=10000&direction=expense&limit=50
```

Example history response (short interval):

```json
{
  "meta": {
    "revision": "r42",
    "asOf": "2026-10-29T18:30:00Z",
    "timeZone": "Europe/Kyiv",
    "currency": "UAH"
  },
  "period": { "from": "2026-10-28", "to": "2026-10-29" },
  "availableFrom": "2025-01-01",
  "coverage": "partial",
  "points": [
    { "date": "2026-10-28", "balanceMinor": null },
    { "date": "2026-10-29", "balanceMinor": 4200000 }
  ]
}
```

Example transaction (also the PATCH response and list item):

```json
{
  "id": "tx-123",
  "bankId": "bank-123",
  "timestamp": "2026-10-28T12:03:00Z",
  "amountMinor": -45000,
  "operationAmountMinor": -1000,
  "operationCurrencyCode": 978,
  "operationMinorUnit": 2,
  "balanceMinor": 4200000,
  "mcc": "5411",
  "categoryId": "groceries",
  "categorySource": "bank",
  "version": "v1",
  "fee": null
}
```

```http
PATCH /api/v1/transactions/tx-123/category
If-Match: v1
Content-Type: application/json

{"categoryId":"credit"}
```

Returns the same transaction with categoryId credit, categorySource manual, version v2. Original amount, MCC, timestamp and balance are unchanged. Empty list returns `{"items":[],"nextCursor":null,"revision":"r42"}`. Categories returns e.g. `{"items":[{"id":"credit","name":"Credit"}],"version":"c1"}` (excerpt, full catalogue pending).

```http
PUT /api/v1/credit-limit
If-Match: l1
Content-Type: application/json

{"amountMinor":5000000}
```

Response: `{"amountMinor":5000000,"updatedAt":"2026-10-29T18:30:00Z","version":"l2"}`. Initially amountMinor/updatedAt are null. Zero is a deliberately entered zero limit, not unset.

Sync start example: POST {} with an idempotency key returns 202 `{"jobId":"sync-12","statusUrl":"/api/v1/sync"}`. Poll response: `{"state":"running","lastSuccessfulAt":"2026-10-29T17:00:00Z","stale":false,"jobId":"sync-12","error":null}`. After success state becomes idle and lastSuccessfulAt advances; after failure keep lastSuccessfulAt and existing financial data. Repeated refresh while running returns the existing job; rate limits use 429 and Retry-After. Do not report successful POST as completed bank synchronization.

## Errors, empty and partial results

Use application/problem+json with Problem shape. Example:

```json
{
  "type": "https://capital-os.example/problems/invalid-range",
  "title": "Invalid range",
  "status": 400,
  "detail": "from must not be after to",
  "requestId": "req-1",
  "invalidParams": [{ "name": "from", "reason": "after to" }]
}
```

All protected endpoints: 401 expired/missing session, 403 disallowed identity, 429 rate limited (Retry-After), 503 transient unavailable. Reads: 400 invalid filters, 404 unknown transaction, 410 expired cursor. Mutations: 400 invalid money/category, 404 missing transaction, 412 version conflict (reload and ask user to reapply), 403 CSRF failure. Never silently overwrite competing changes. Malformed/unexpected response must be a recoverable client error, not an unchecked type assertion.

No transactions in a complete period: zero cashflow, zero monthly bars and empty spending categories. Unavailable balance/history: null with coverage, not an invented zero. Initial no data: explanatory empty state and sync action. Background failure: keep the last successful values and their timestamp, display warning/retry. If a requested historical filter fails, label retained data with its original dates. Following a category mutation, stale aggregates must be marked refreshing until the new revision is obtained. Credit edit affects no historical values.

Private financial responses: Cache-Control: private, no-store initially; in-memory client reuse scoped to session. Reconsider private ETags later if needed. On logout/401 clear sensitive cache. No third-party logs of bank IDs, statements or auth payloads.

## Decisions needed before integration

1. Confirm aggregate + independent history approach and shared revision semantics.
2. Confirm bank balance/own funds/credit-used definitions and valid entered credit-limit bounds. Frontend will not subtract the limit speculatively.
3. Supply fixed category IDs, default MCC mapping and behavior if the bank later changes an operation. Manual override precedence must persist across synchronization.
4. Confirm commission field meaning and whether it is already included in movement.
5. Confirm timezone, available-history completeness, history size cap and treatment of gaps.
6. Confirm cursor/filter implementation costs in DynamoDB, stable snapshots and cursor lifetime.
7. Confirm sync freshness threshold, polling/backoff, idempotency and error codes.
8. Confirm same-origin Google session, CSRF and allowed-user enforcement.

No endpoint here is APPROVED. No Planned Balance, portfolio, installments, custom categories, multiple accounts, theme/language settings or historical credit-limit endpoints are proposed.
