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
import type { HistoryPreset } from "./contracts";

import {
  loadBalance,
  loadCashflow,
  loadMonthly,
  loadSpending,
  liveCredit,
  liveBalance,
  liveCashflow,
} from "./mockResources";
import { useCreditLimit } from "./useCreditLimit";
import { useBalanceHistory } from "./useBalanceHistory";
import { useWidget } from "./useWidget";
import WidgetStatus from "./WidgetStatus";
import { money, shortDate, bankTimestamp } from "./format";
import Transactions from "./Transactions";
const HistoryChart = lazy(() =>
  import("./Charts").then((m) => ({ default: m.HistoryChart })),
);
const MonthlyChart = lazy(() =>
  import("./Charts").then((m) => ({ default: m.MonthlyChart })),
);
const SpendingChart = lazy(() =>
  import("./Charts").then((m) => ({ default: m.SpendingChart })),
);
export default function App() {
  const [page, setPage] = useState("dashboard"),
    [preset, setPreset] = useState<HistoryPreset>("3M"),
    [sync, setSync] = useState("idle"),
    [lastSync, setLastSync] = useState(""),
    [editing, setEditing] = useState(false);
  const balance = useWidget(loadBalance, page === "dashboard");
  const cashflow = useWidget(loadCashflow, page === "dashboard");
  const spending = useWidget(loadSpending);
  const monthly = useWidget(loadMonthly, page === "dashboard");
  const history = useBalanceHistory(preset, page === "dashboard");
  const credit = useCreditLimit(page === "dashboard");
  const reloadSpending = spending.reload;
  useEffect(() => {
    const change = () => {
      void reloadSpending();
    };
    window.addEventListener("capital-category-change", change);
    return () => window.removeEventListener("capital-category-change", change);
  }, [reloadSpending]);
  const net = cashflow.data?.netMinor ?? null;
  const limit = credit.data?.amountMinor;
  async function refresh() {
    setSync("loading");
    // Independent resource lifecycles: no all-or-nothing dashboard request.
    void balance.reload();
    void cashflow.reload();
    void spending.reload();
    void monthly.reload();
    void history.reload();
    void credit.reload();
    await new Promise((resolve) => setTimeout(resolve, 650));
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
        {(["1M", "3M", "6M", "12M", "All"] as const).map((value) => (
          <button
            key={value}
            aria-pressed={preset === value}
            onClick={() => setPreset(value)}
          >
            {value}
          </button>
        ))}
      </div>
      {history.data && (
        <p className="range-label">
          {history.data.from
            ? `${shortDate(history.data.from)} – ${shortDate(history.data.to)}`
            : "No recorded history"}{" "}
          · History only · Calculated{" "}
          <time dateTime={history.data.computedAt}>
            {bankTimestamp(history.data.computedAt)}
          </time>{" "}
          · {history.data.to} partial day
        </p>
      )}
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
              {liveBalance
                ? "Local API · Demo analytics"
                : "Demo · 29 Oct 2026"}
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
                {sync === "loading"
                  ? "Refreshing…"
                  : liveBalance
                    ? "Reload data"
                    : "Refresh demo"}
              </button>
            </div>
            <div className="sync-status" role="status">
              <span className="status-dot" />
              {liveBalance
                ? "Balance and cashflow from local backend · Categories use demo data · Reload does not sync with Monobank"
                : sync === "error"
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
                    <WidgetStatus
                      name="balance"
                      {...balance}
                      hasData={!!balance.data}
                      retry={balance.reload}
                    />
                    <strong>
                      {money(balance.data?.bankBalanceMinor ?? null)}
                    </strong>
                    <span>
                      Monobank · UAH ·{" "}
                      {liveBalance ? "Bank data fetched" : "As of"}{" "}
                      {balance.data ? (
                        <time dateTime={balance.data.fetchedAt}>
                          {bankTimestamp(balance.data.fetchedAt)}
                        </time>
                      ) : (
                        "unknown"
                      )}
                    </span>
                    <div className="balance-detail">
                      <span>Own funds / credit used</span>
                      <span>
                        {balance.data?.ownFundsMinor == null &&
                        balance.data?.creditUsedMinor == null
                          ? "Estimate unavailable"
                          : `${money(balance.data?.ownFundsMinor ?? null)} / ${money(balance.data?.creditUsedMinor ?? null)}`}
                      </span>
                    </div>
                    <p className="helper">
                      {liveBalance
                        ? "Saved bank snapshot. Reloading does not sync with Monobank."
                        : "Synthetic balance; own funds and credit usage are not estimated."}
                    </p>
                    <WidgetStatus
                      name="credit limit"
                      {...credit}
                      hasData={!!credit.data}
                      retry={credit.reload}
                    />
                    {liveCredit && (
                      <p className="helper">Credit limit from local backend.</p>
                    )}
                    <div className="limit-row">
                      <span>
                        Entered credit limit:{" "}
                        {credit.data
                          ? limit === null
                            ? "Not set"
                            : money(limit ?? null)
                          : credit.loading
                            ? "Loading…"
                            : "Unavailable"}
                      </span>
                      <button
                        id="edit-credit-limit"
                        disabled={!credit.data}
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
                    <WidgetStatus
                      name="cashflow"
                      {...cashflow}
                      hasData={!!cashflow.data}
                      retry={cashflow.reload}
                    />
                    <strong
                      className={
                        net === null ? "" : net < 0 ? "negative" : "positive"
                      }
                    >
                      {net !== null && net >= 0 ? "+" : ""}
                      {money(net)}
                    </strong>
                    <span>
                      {cashflow.data
                        ? `${cashflow.data.from} – ${cashflow.data.to} · Month to date`
                        : "Current calendar month"}
                    </span>
                    <div className="cashflow-rows">
                      <div>
                        <span>Income</span>
                        <b className="positive">
                          {cashflow.data?.incomeMinor != null ? "+" : ""}
                          {money(cashflow.data?.incomeMinor ?? null)}
                        </b>
                      </div>
                      <div>
                        <span>Expenses</span>
                        <b className="negative">
                          {cashflow.data?.expenseMinor != null ? "−" : ""}
                          {money(cashflow.data?.expenseMinor ?? null)}
                        </b>
                      </div>
                    </div>
                    <p className="helper">
                      {liveCashflow
                        ? "Based on stored transactions. Includes outgoing transfers. No planned amounts."
                        : "Actual income minus actual expenses. Includes outgoing transfers. No planned amounts."}
                      {liveCashflow && cashflow.data && (
                        <>
                          {" "}
                          Calculated{" "}
                          <time dateTime={cashflow.data.computedAt}>
                            {bankTimestamp(cashflow.data.computedAt)}
                          </time>
                          .
                        </>
                      )}
                    </p>
                  </article>
                </section>
                <div className="resource-history">
                  <WidgetStatus
                    name="history"
                    {...history}
                    hasData={!!history.data}
                    retry={history.reload}
                  />
                  {history.data ? (
                    <Suspense
                      fallback={
                        <section className="panel timeline">
                          <h2>Balance History</h2>
                          {filters}
                          <div className="chart" />
                        </section>
                      }
                    >
                      <HistoryChart
                        data={history.data}
                        historyControls={filters}
                      />
                    </Suspense>
                  ) : (
                    <section className="panel timeline">
                      <h2>Balance History</h2>
                      {filters}
                      <div className="chart" />
                    </section>
                  )}
                </div>
                <div className="resource-monthly">
                  <WidgetStatus
                    name="monthly cashflow"
                    {...monthly}
                    hasData={!!monthly.data}
                    retry={monthly.reload}
                  />
                  {monthly.data ? (
                    <Suspense
                      fallback={
                        <section className="panel monthly">
                          <h2>Monthly Income &amp; Expenses</h2>
                          <div className="chart" />
                        </section>
                      }
                    >
                      <MonthlyChart data={monthly.data} />
                    </Suspense>
                  ) : (
                    <section className="panel monthly">
                      <h2>Monthly Income &amp; Expenses</h2>
                      <div className="chart" />
                    </section>
                  )}
                </div>
                <div className="resource-spending">
                  <WidgetStatus
                    name="spending"
                    {...spending}
                    hasData={!!spending.data}
                    retry={spending.reload}
                  />
                  {spending.data ? (
                    <Suspense
                      fallback={
                        <section className="panel breakdown">
                          <h2>Spending by Category</h2>
                          <div className="donut-wrap" />
                        </section>
                      }
                    >
                      <SpendingChart data={spending.data} />
                    </Suspense>
                  ) : (
                    <section className="panel breakdown">
                      <h2>Spending by Category</h2>
                      <div className="donut-wrap" />
                    </section>
                  )}
                </div>
              </>
            )}
            {editing && credit.data && (
              <CreditDrawer
                current={credit.data}
                demo={!liveCredit}
                onClose={() => setEditing(false)}
                onSave={async (request) => {
                  await credit.save(request);
                  if (liveBalance) void balance.reload();
                }}
                onCheck={credit.reload}
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
