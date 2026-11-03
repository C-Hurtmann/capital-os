# Verification — architecture update, 2026-11-02

Strict TypeScript production build, ESLint and formatting checked. 22 unit tests pass: seven accounting fixture invariants plus fifteen credit-limit cases covering unset/zero, unsafe or negative amounts, mixed nulls, invalid UTC timestamps, Problem Details and non-JSON gateway failures.

12 Chromium tests pass. Dashboard widths: 375, 768, 1440, 1920; horizontal overflow and axe tagged accessibility checks. Scenarios cover history-only filtering, category persistence, offline refresh, credit drawer geometry/focus, isolated history retry retaining the actual previous interval, rapid preset changes and malformed credit data without false zeroes.

A separate Vite API-mode server tests the credit GET through browser HTTP interception: explicit zero overrides demo storage without modifying it, editing stays disabled, gateway failure does not block charts, retry accepts unset. These are controlled contract tests, not an end-to-end test against the real backend. Local backend target is configurable; auth/PUT remain pending.

Desktop screenshots visually reviewed; chart JavaScript remains lazy-loaded. History cache is deliberately deferred to https://trello.com/c/3P9yMUG7. Backend financial rules are represented only by synthetic fixture services until each real resource contract is approved. No backend/infrastructure edits, commit or push.
