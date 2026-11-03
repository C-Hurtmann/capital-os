# Verification — architecture update, 2026-11-02

Strict TypeScript production build, ESLint and formatting checked. 22 unit tests pass: seven accounting fixture invariants plus fifteen credit-limit cases covering unset/zero, unsafe or negative amounts, mixed nulls, invalid UTC timestamps, Problem Details and non-JSON gateway failures.

12 Chromium tests pass. Dashboard widths: 375, 768, 1440, 1920; horizontal overflow and axe tagged accessibility checks. Scenarios cover history-only filtering, category persistence, offline refresh, credit drawer geometry/focus, isolated history retry retaining the actual previous interval, rapid preset changes and malformed credit data without false zeroes.

A separate Vite API-mode server tests the credit GET through browser HTTP interception: explicit zero overrides demo storage without modifying it, editing stays disabled, gateway failure does not block charts, retry accepts unset. These are controlled contract tests, not an end-to-end test against the real backend. Local backend target is configurable; auth/PUT remain pending.

Desktop screenshots visually reviewed; chart JavaScript remains lazy-loaded. History cache is deliberately deferred to https://trello.com/c/3P9yMUG7. Backend financial rules are represented only by synthetic fixture services until each real resource contract is approved. No backend/infrastructure edits, commit or push.

## First real backend integration — 2026-11-03

Real Chromium smoke test against `npm run dev:api -- --port 5174 --strictPort`: relative `/api/v1/credit-limit` was proxied to FastAPI on 127.0.0.1:8001. HTTP 200, server uvicorn, actual JSON `{ "amountMinor": null, "effectiveFrom": null }`; UI showed Not set. An intentionally preloaded demo limit did not override the response. No CORS, console or page errors. Existing charts remained usable and editing stayed disabled. No backend writes or CORS changes.

Zero and positive limits were checked with controlled browser responses (not by changing actual bank data). 13 browser tests and 22 unit tests pass, including demand-driven fetching: refreshing Transactions does not request credit-limit; returning to Dashboard reloads it. Build, ESLint and Prettier pass. Default demo mode retained.

Changed for this integration: vite.config.ts, package.json, src/App.tsx, src/useWidget.ts, playwright.config.ts, tests/credit-api.spec.ts, README.md and this verification log. Existing typed client/runtime validator reused unchanged. Trello: https://trello.com/c/W83TwF6R (backend link https://trello.com/c/Gc0voGta).
