# Capital OS frontend

Responsive Ukrainian-language financial dashboard. Frontend only; no backend, infrastructure or legacy files were changed. API contracts remain **PROPOSED**, pending review.

## Run

Use Node 22.13+ (recommended) and npm in Linux/WSL for this Linux checkout. Do not share node_modules between Windows and Linux.

```sh
cd /home/czagorodnyi/projects/capital-os/frontend
npm ci
npm run dev
```

Open http://localhost:5173. Demo mode is the default and makes no API calls. The dataset is synthetic, deterministic and anchored to **2026-10-29**, covering January–October 2026. No bank data or credentials are used. Values and dates are formatted for uk-UA, UAH. Prior empty dates can be selected to inspect empty state.

```sh
npm run lint
npm test
npm run build
npm run format:check
npx playwright install chromium
npx playwright test
```

`npm run preview` serves the production bundle. `npm run format` formats sources. Tests and screenshots are local artifacts under ignored test-results/.

## Design and choices

React + strict TypeScript + Vite: a client-rendered, one-screen application, no SSR needs and no router or global store. Local state and an abortable effect handle period/account filters and loading. CSS Grid and media queries handle phones, tablets and wide monitors; no UI kit or styling runtime. Lucide supplies consistent icons. Recharts provides interactive SVG graphs, responsive layout and keyboard navigation; native expandable tables expose daily/monthly data, and category buttons expose exact category values. Native date inputs avoid a heavyweight calendar dependency. Locale is Ukrainian because the initial integration is Monobank/UAH.

Warm neutral surfaces, deep green emphasis, restrained typography and sparse borders keep financial data dominant. All filters apply to all series; current balance is clearly distinguished from historical period-end balance. Transfer treatment is described beside the cashflow and in the footer. Presets complement the custom range. Loading clears old chart views, aborting obsolete requests prevents stale responses, errors offer recovery, and zero activity preserves balance continuity.

Alternatives: Vue would also be suitable; legacy Vue is mostly a scaffold, so migration investment is minimal. A query cache is useful when several pages share server data, but unnecessary here. Full transaction downloads would simplify mock-to-API parity but expose more data and require client financial aggregation; the proposed server aggregates are preferable. Recharts adds bundle weight; acceptable for this data-focused screen, with code splitting a future measurement-driven option.

## Structure

- src/contracts.ts: typed provisional response/query shapes.
- src/data.ts: synthetic transactions, financial aggregation and mock/HTTP adapter.
- src/format.ts: display formatting and zero-safe comparisons.
- src/App.tsx: dashboard composition, filters and states.
- src/Charts.tsx: lazy-loaded interactive charts and accessible tables.
- src/styles.css: responsive visual system and keyboard focus styling.
- src/data.test.ts: accounting invariants, dates, account filtering and transfer semantics.
- tests/dashboard.spec.ts: browser layout, interactions and automated accessibility scans.
- docs/api-contract-proposal.md: single API proposal, examples, semantics and decision log.

## Legacy discovery

Read-only reference: local project_0 dashboard/views.py, transactions/models.py, dashboard/services/plots/scatter.py and frontend/project_0/src/views/DashboardView.vue. Legacy derives a daily running balance from transactions, uses current-month MCC spending and grouped monthly positive/negative amounts. Its dashboard directly queries Transaction.objects, bypassing the transfer visibility manager, so paired internal transfers can inflate both incomes and expenses. Multi-account/currency semantics are not explicit; empty transaction sets assume a first row. Vue dashboard contains only placeholder bar/pie components. Improvements: consistent date filters for every panel, distinct current/historical balances, explicit account scope, transfer exclusion from cashflow, empty/error states, accessible tables, keyboard use and responsive layout.

## Future HTTP integration

Only after backend agreement, configure Vite environment variables (public configuration only):

```sh
VITE_DATA_SOURCE=http
VITE_API_BASE_URL=https://your-api-host.example
```

Prefer same-origin reverse proxy and HttpOnly session cookies; cross-origin cookie/CORS behavior needs explicit backend design. Never place Monobank tokens or secrets in frontend variables. Adapter calls the proposed GET /api/v1/dashboard, sends an AbortSignal, checks HTTP status, then consumes the typed response. Runtime schema validation, structured problem field mapping and real authentication require backend agreement before production. No fallback to synthetic data on API failure. Native UAH only; no currency conversion or portfolio screen.

The mocked date boundary and preset intervals are fixed to the demo snapshot. Live-date presets, backend-provided account metadata before initial filtering, source freshness, refund rules and authentication should be finalized with the actual integration; HTTP mode is an integration seam, not a verified production backend.

## Accessibility and verification scope

Semantic landmarks/headings, visible focus, skip link, labeled inputs, keyboard-operable filters, status/alert feedback, category names and values, and data tables supplement chart colors. Automated WCAG-tagged axe scans and viewport overflow checks are included. These checks do not establish full WCAG 2.2 AA conformance; manual assistive technology and browser testing remain appropriate before release. See docs/verification.md for actual run results.
