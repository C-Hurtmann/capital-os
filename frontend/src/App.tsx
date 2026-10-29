import { lazy, Suspense, useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChartNoAxesCombined,
  ChevronRight,
  CircleHelp,
  Layers3,
  RefreshCw,
  Wallet,
} from "lucide-react";
import type { Dashboard, DashboardQuery } from "./contracts";
import { accounts, DEMO_TODAY, getDashboard, validateQuery } from "./data";
import { change, money, shortDate } from "./format";
const Charts = lazy(() => import("./Charts"));
const initial = { from: "2026-10-01", to: DEMO_TODAY, currency: "UAH" };
export default function App() {
  const [query, setQuery] = useState<DashboardQuery>(initial),
    [draft, setDraft] = useState(initial),
    [data, setData] = useState<Dashboard | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0),
    [preset, setPreset] = useState("month");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    getDashboard(query, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Невідома помилка");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, retry]);
  function selectPeriod(value: string) {
    setPreset(value);
    if (value === "custom") return;
    const from =
      value === "month"
        ? "2026-10-01"
        : value === "quarter"
          ? "2026-08-01"
          : "2026-01-01";
    setDraft({ from, to: DEMO_TODAY, currency: "UAH" });
    setQuery((q) => ({ ...q, from, to: DEMO_TODAY }));
  }
  const isDemo = import.meta.env.VITE_DATA_SOURCE !== "http";
  return (
    <>
      <a className="skip-link" href="#main">
        Перейти до огляду
      </a>
      <div className="app-shell">
        <aside className="sidebar">
          <a className="brand" href="#main" aria-label="Capital OS, головна">
            <span className="brand-mark">
              <Layers3 size={23} />
            </span>
            <span>
              capital<span className="brand-os">os</span>
              <small>PERSONAL FINANCE</small>
            </span>
          </a>
          <div className="workspace">
            <span className="avatar">Я</span>
            <div>
              Особистий простір<small>Ваш фінансовий погляд</small>
            </div>
          </div>
          <span className="nav-label">РОБОЧИЙ ПРОСТІР</span>
          <nav aria-label="Основна навігація">
            <a className="nav-active" href="#main" aria-current="page">
              <ChartNoAxesCombined size={19} />
              Фінансовий огляд
              <ChevronRight size={15} />
            </a>
          </nav>
          <div className="sidebar-bottom">
            <div className="quiet-card">
              <span className="mini-mark">↗</span>
              <strong>
                Більше ясності.
                <br />
                Кращі рішення.
              </strong>
              <p>
                Усі ваші фінанси —<br />в одному місці.
              </p>
            </div>
            <a href="#about" className="about-link">
              <CircleHelp size={17} />
              Про дані та розрахунки
            </a>
            <span className="sidebar-footer">
              CAPITAL OS <span>v0.1</span>
            </span>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <span>
              Особисті фінанси <ChevronRight size={13} /> <strong>Огляд</strong>
            </span>
            <span className="private">
              <span className="status-dot" />
              {isDemo ? "Демонстраційні дані" : "API · підключено"}
            </span>
          </header>
          <main id="main">
            <div className="page-heading">
              <div>
                <span className="eyebrow">ВАША ФІНАНСОВА КАРТИНА</span>
                <h1>
                  Фінансовий огляд<span>.</span>
                </h1>
                <p>Менше здогадок. Більше контролю над вашими коштами.</p>
              </div>
              <button
                className="refresh"
                onClick={() => setRetry((r) => r + 1)}
                disabled={loading}
              >
                <RefreshCw size={16} />
                Оновити
              </button>
            </div>
            <div className="filters">
              <div className="period-tabs" role="group" aria-label="Період">
                {[
                  ["month", "Цей місяць"],
                  ["quarter", "3 місяці"],
                  ["year", "Цей рік"],
                  ["custom", "Свій період"],
                ].map(([v, l]) => (
                  <button
                    key={v}
                    aria-pressed={preset === v}
                    onClick={() => selectPeriod(v)}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <label className="account-label">
                <Wallet size={16} />
                <select
                  aria-label="Рахунок"
                  value={query.accountId || ""}
                  onChange={(e) =>
                    setQuery((q) => ({
                      ...q,
                      accountId: e.target.value || undefined,
                    }))
                  }
                >
                  <option value="">Усі рахунки · UAH</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · UAH
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {preset === "custom" && (
              <form
                className="custom-range"
                onSubmit={(e) => {
                  e.preventDefault();
                  try {
                    validateQuery({ ...query, ...draft });
                    setError("");
                    setQuery((q) => ({ ...q, ...draft }));
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <label>
                  Від
                  <input
                    type="date"
                    required
                    value={draft.from}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, from: e.target.value }))
                    }
                  />
                </label>
                <label>
                  До
                  <input
                    type="date"
                    required
                    value={draft.to}
                    max={isDemo ? DEMO_TODAY : undefined}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, to: e.target.value }))
                    }
                  />
                </label>
                <button className="primary" type="submit">
                  Застосувати
                </button>
              </form>
            )}
            <div className="period-caption">
              <span>
                {shortDate(query.from)} — {shortDate(query.to)}{" "}
                {query.to.slice(0, 4)}
              </span>
              <span>Валюта: українська гривня ₴</span>
            </div>
            {error ? (
              <div className="error" role="alert">
                <strong>Не вдалося показати огляд</strong>
                <p>{error}</p>
                <button onClick={() => setRetry((r) => r + 1)}>
                  Спробувати ще раз
                </button>
              </div>
            ) : loading ? (
              <div className="loading" role="status">
                <RefreshCw size={24} />
                <p>Завантажуємо фінансову картину…</p>
              </div>
            ) : (
              data && (
                <>
                  <section className="overview" aria-label="Основні показники">
                    <article className="metric balance">
                      <div className="metric-title">
                        Поточний баланс
                        <Wallet size={18} />
                      </div>
                      <strong>
                        {money(data.overview.currentBalanceMinor)}
                      </strong>
                      <span>
                        Станом на {shortDate(data.asOf)} ·{" "}
                        {query.accountId ? 1 : data.accounts.length} рах.
                      </span>
                      <div className="balance-line" />
                    </article>
                    <article className="metric">
                      <div className="metric-title">
                        Доходи за період
                        <span className="metric-icon income">
                          <ArrowDownLeft size={18} />
                        </span>
                      </div>
                      <strong>{money(data.overview.incomeMinor)}</strong>
                      <span>
                        {change(
                          data.overview.incomeMinor,
                          data.overview.previousIncomeMinor,
                        )}
                      </span>
                    </article>
                    <article className="metric">
                      <div className="metric-title">
                        Витрати за період
                        <span className="metric-icon expense">
                          <ArrowUpRight size={18} />
                        </span>
                      </div>
                      <strong>{money(data.overview.expenseMinor)}</strong>
                      <span>
                        {change(
                          data.overview.expenseMinor,
                          data.overview.previousExpenseMinor,
                        )}
                      </span>
                    </article>
                    <article className="metric">
                      <div className="metric-title">
                        Зміна балансу
                        <ChartNoAxesCombined size={18} />
                      </div>
                      <strong>
                        {data.overview.closingBalanceMinor >=
                        data.overview.openingBalanceMinor
                          ? "+"
                          : ""}
                        {money(
                          data.overview.closingBalanceMinor -
                            data.overview.openingBalanceMinor,
                        )}
                      </strong>
                      <span>Від початку до кінця періоду</span>
                    </article>
                  </section>
                  {data.overview.incomeMinor === 0 &&
                    data.overview.expenseMinor === 0 && (
                      <div className="empty" role="status">
                        За обраний період операцій немає. Баланс збережено;
                        спробуйте інший період.
                      </div>
                    )}
                  <Suspense
                    fallback={
                      <div className="loading" role="status">
                        Завантажуємо графіки…
                      </div>
                    }
                  >
                    <Charts data={data} />
                  </Suspense>
                </>
              )
            )}
            <footer id="about">
              <span>
                <span className="status-dot" />
                {isDemo ? "Демо · фіксована дата 29 жовтня 2026" : "Дані з API"}
              </span>
              <p>
                Баланс включає перекази. Доходи та витрати виключають внутрішні
                перекази. Порівняння — з попереднім періодом тієї ж тривалості.
                Часовий пояс: Europe/Kyiv.
              </p>
            </footer>
          </main>
        </div>
      </div>
    </>
  );
}
