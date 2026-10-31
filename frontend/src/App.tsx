import CreditDrawer from "./CreditDrawer";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  Layers3,
  LayoutDashboard,
  ArrowLeftRight,
  RefreshCw,
  ArrowUpRight,
  Wallet,
} from "lucide-react";
import { aggregate, DEMO_TODAY, validateQuery } from "./data";
import { money, shortDate } from "./format";
import Transactions from "./Transactions";
const Charts = lazy(() => import("./Charts"));
const initial = { from: "2026-08-01", to: DEMO_TODAY, currency: "UAH" };
export default function App() {
  const [page, setPage] = useState("dashboard"),
    [query, setQuery] = useState(initial),
    [draft, setDraft] = useState(initial),
    [preset, setPreset] = useState("3"),
    [error, setError] = useState(""),
    [sync, setSync] = useState("idle"),
    [revision, setRevision] = useState(0),
    [lastSync, setLastSync] = useState(""),
    [limit, setLimit] = useState(
      () => localStorage.getItem("capital-demo-credit-limit") || "",
    ),
    [editing, setEditing] = useState(false);
  useEffect(() => {
    const change = () => setRevision((r) => r + 1);
    window.addEventListener("capital-category-change", change);
    return () => window.removeEventListener("capital-category-change", change);
  }, []);
  // Review build intentionally uses synthetic data; it does not call unapproved endpoints.
  void revision;
  const current = aggregate({
    from: "2026-10-01",
    to: DEMO_TODAY,
    currency: "UAH",
  });
  const history = aggregate(query);
  const annual = aggregate({
    from: "2025-11-01",
    to: DEMO_TODAY,
    currency: "UAH",
  });
  const net = current.overview.incomeMinor - current.overview.expenseMinor;
  function period(value: string) {
    setPreset(value);
    if (value === "custom") return;
    const from =
      value === "3"
        ? "2026-08-01"
        : value === "6"
          ? "2026-05-01"
          : value === "12"
            ? "2025-10-30"
            : "2025-01-01";
    setQuery({ ...initial, from });
    setDraft({ ...initial, from });
    setError("");
  }
  async function refresh() {
    setSync("loading");
    await new Promise((r) => setTimeout(r, 650));
    if (!navigator.onLine) {
      setSync("error");
      return;
    }
    setLastSync(new Date().toLocaleTimeString("en-GB"));
    setSync("success");
  }
  const filters = (
    <>
      <div
        className="history-controls"
        role="group"
        aria-label="Balance history period"
      >
        {[
          ["3", "3 months"],
          ["6", "6 months"],
          ["12", "1 year"],
          ["all", "All history"],
          ["custom", "Custom"],
        ].map(([value, label]) => (
          <button
            key={value}
            aria-pressed={preset === value}
            onClick={() => period(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {preset === "custom" && (
        <form
          className="custom-range"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              validateQuery(draft);
              setQuery(draft);
              setError("");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <label>
            From
            <input
              type="date"
              required
              min="2025-01-01"
              max={DEMO_TODAY}
              value={draft.from}
              onChange={(e) =>
                setDraft((d) => ({ ...d, from: e.target.value }))
              }
            />
          </label>
          <label>
            To
            <input
              type="date"
              required
              min="2025-01-01"
              max={DEMO_TODAY}
              value={draft.to}
              onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            />
          </label>
          <button className="primary">Apply dates</button>
        </form>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="range-label">
        {shortDate(query.from)} – {shortDate(query.to)} · History only
      </p>
    </>
  );
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="app-shell">
        <aside className="sidebar">
          <a className="brand" href="#main" aria-label="Capital OS home">
            <span className="brand-mark">
              <Layers3 size={23} />
            </span>
            <span>
              Capital OS<small>PERSONAL FINANCE</small>
            </span>
          </a>
          <span className="nav-label">YOUR WORKSPACE</span>
          <nav aria-label="Main navigation">
            {[
              ["dashboard", "Dashboard"],
              ["transactions", "Transactions"],
            ].map(([id, label]) => (
              <button
                className={page === id ? "nav-active" : "nav-item"}
                key={id}
                aria-current={page === id ? "page" : undefined}
                onClick={() => setPage(id)}
              >
                {id === "dashboard" ? (
                  <LayoutDashboard size={18} />
                ) : (
                  <ArrowLeftRight size={18} />
                )}
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="quiet-card">
              <strong>
                A clearer view.
                <br />A calmer mind.
              </strong>
              <p>Your money, in perspective.</p>
            </div>
            <span className="sidebar-footer">
              DESIGN REVIEW <span>v0.9</span>
            </span>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <span>
              Personal workspace <span>/</span>
              <strong>
                {page === "dashboard" ? "Overview" : "Transactions"}
              </strong>
            </span>
            <span className="private">
              <span className="status-dot" />
              Demo · 29 Oct 2026
            </span>
          </header>
          <main id="main">
            <div className="page-heading">
              <div>
                <span className="eyebrow">YOUR MONEY, IN PERSPECTIVE</span>
                <h1>
                  {page === "dashboard" ? "Financial overview" : "Transactions"}
                  <span>.</span>
                </h1>
                <p>
                  {page === "dashboard"
                    ? "A clear picture of your account. Facts first."
                    : "Explore your activity and make categories your own."}
                </p>
              </div>
              <button
                className="refresh"
                onClick={refresh}
                disabled={sync === "loading"}
              >
                <RefreshCw size={16} />
                {sync === "loading" ? "Refreshing…" : "Refresh demo"}
              </button>
            </div>
            <div className="sync-status" role="status">
              <span className="status-dot" />
              {sync === "error"
                ? "Refresh failed. Your previously loaded data is still available."
                : sync === "loading"
                  ? "Refreshing synthetic data…"
                  : lastSync
                    ? `Demo refreshed at ${lastSync}. No bank connection.`
                    : "Synthetic snapshot · 29 Oct 2026, 18:30 UTC · Not connected to Monobank"}
            </div>
            {page === "transactions" ? (
              <Transactions />
            ) : (
              <>
                <section className="overview" aria-label="Financial summary">
                  <article className="metric balance">
                    <div className="metric-title">
                      Current Balance
                      <Wallet size={20} />
                    </div>
                    <strong>
                      {money(current.overview.currentBalanceMinor)}
                    </strong>
                    <span>Monobank · UAH · As of {shortDate(DEMO_TODAY)}</span>
                    <div className="balance-detail">
                      <span>Own funds / credit used</span>
                      <span>Not yet determined</span>
                    </div>
                    <p className="helper">
                      Bank balance breakdown awaits confirmed bank semantics.
                    </p>
                    <div className="limit-row">
                      <span>
                        Entered credit limit:{" "}
                        {limit ? money(Number(limit)) : "Not set"}
                      </span>
                      <button
                        id="edit-credit-limit"
                        onClick={() => setEditing(!editing)}
                        aria-expanded={editing}
                      >
                        Edit limit
                      </button>
                    </div>
                  </article>
                  <article className="metric net-card">
                    <div className="metric-title">
                      Actual Monthly Net Cashflow
                      <ArrowUpRight size={20} />
                    </div>
                    <strong className={net < 0 ? "negative" : "positive"}>
                      {net >= 0 ? "+" : ""}
                      {money(net)}
                    </strong>
                    <span>October 2026 · Month to date</span>
                    <div className="cashflow-rows">
                      <div>
                        <span>Income</span>
                        <b className="positive">
                          +{money(current.overview.incomeMinor)}
                        </b>
                      </div>
                      <div>
                        <span>Expenses</span>
                        <b className="negative">
                          −{money(current.overview.expenseMinor)}
                        </b>
                      </div>
                    </div>
                    <p className="helper">
                      Actual income minus actual expenses. Includes outgoing
                      transfers. No planned amounts.
                    </p>
                  </article>
                </section>
                <Suspense
                  fallback={
                    <div className="loading" role="status">
                      Loading charts…
                    </div>
                  }
                >
                  <Charts
                    data={{
                      ...current,
                      timeline: history.timeline,
                      overview: {
                        ...current.overview,
                        closingBalanceMinor:
                          history.overview.closingBalanceMinor,
                      },
                      months: annual.months,
                    }}
                    historyControls={filters}
                  />
                </Suspense>
              </>
            )}
            {editing && (
              <CreditDrawer
                limit={limit}
                onClose={() => setEditing(false)}
                onSave={(value) => {
                  localStorage.setItem("capital-demo-credit-limit", value);
                  setLimit(value);
                }}
              />
            )}
            <footer>
              <span>
                <span className="status-dot" />
                PRIVATE DEMO · REVIEW BUILD
              </span>
              <p>
                One Monobank UAH account. Synthetic history from January 2025.
                All positive movements are income; all negative movements are
                expenses. No live bank connection. Design details remain open
                for review.
              </p>
            </footer>
          </main>
        </div>
      </div>
    </>
  );
}
