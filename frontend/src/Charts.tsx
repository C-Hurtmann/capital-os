import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Dashboard } from "./contracts";
import { money, monthLabel, shortDate } from "./format";
const colors = [
  "#286448",
  "#b17a38",
  "#567a9b",
  "#8c6596",
  "#8a7736",
  "#677773",
];
function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | number)[][];
}) {
  return (
    <details className="data-table">
      <summary>Переглянути дані таблицею</summary>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((v, j) => (
                  <td key={j}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
export default function Charts({ data }: { data: Dashboard }) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const selected = data.categories.find((c) => c.id === activeCategory);
  const net = data.overview.incomeMinor - data.overview.expenseMinor;
  return (
    <>
      <div className="chart-grid">
        <section className="panel timeline">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">ВАШІ КОШТИ В ЧАСІ</span>
              <h2>Динаміка балансу</h2>
            </div>
            <span className="unit">UAH</span>
          </div>
          <div className="chart-value">
            {money(data.overview.closingBalanceMinor)}
            <span>на кінець періоду</span>
          </div>
          <div
            className="chart"
            role="group"
            aria-label="Графік щоденного балансу. Стрілки вліво та вправо для перегляду."
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data.timeline}
                margin={{ top: 15, right: 12, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#377355" stopOpacity={0.23} />
                    <stop
                      offset="100%"
                      stopColor="#377355"
                      stopOpacity={0.01}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  vertical={false}
                  stroke="#e7ebe7"
                  strokeDasharray="3 4"
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={shortDate}
                  minTickGap={45}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#63716b", fontSize: 11 }}
                />
                <YAxis
                  width={54}
                  tickFormatter={(v) => `${Math.round(v / 100000)} тис.`}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#63716b", fontSize: 11 }}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  labelFormatter={(v) => shortDate(String(v))}
                  formatter={(v) => [money(Number(v)), "Баланс"]}
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid #d5ded7",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="balanceMinor"
                  stroke="#286448"
                  strokeWidth={2.5}
                  fill="url(#balanceFill)"
                  name="Баланс"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <DataTable
            headers={["Дата", "Баланс"]}
            rows={data.timeline.map((t) => [
              shortDate(t.date),
              money(t.balanceMinor),
            ])}
          />
        </section>
        <section className="panel breakdown">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">СТРУКТУРА ВИТРАТ</span>
              <h2>На що йдуть кошти</h2>
            </div>
            <span className="unit">MCC</span>
          </div>
          {data.categories.length ? (
            <>
              <div className="donut-wrap">
                <div className="donut">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.categories}
                        dataKey="amountMinor"
                        nameKey="label"
                        innerRadius="72%"
                        outerRadius="94%"
                        paddingAngle={3}
                        stroke="none"
                        isAnimationActive={false}
                      >
                        {data.categories.map((c, i) => (
                          <Cell
                            key={c.id}
                            fill={colors[i % colors.length]}
                            opacity={
                              selected && selected.id !== c.id ? 0.35 : 1
                            }
                          />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => money(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="donut-label">
                  <span>{selected ? selected.label : "Усього витрат"}</span>
                  <strong>
                    {money(
                      selected
                        ? selected.amountMinor
                        : data.overview.expenseMinor,
                    )}
                  </strong>
                </div>
              </div>
              <div className="category-list">
                {data.categories.map((c, i) => (
                  <button
                    key={c.id}
                    aria-pressed={activeCategory === c.id}
                    onClick={() =>
                      setActiveCategory(activeCategory === c.id ? null : c.id)
                    }
                  >
                    <span className="category-name">
                      <i style={{ background: colors[i % colors.length] }} />
                      {c.label}
                    </span>
                    <span>
                      {money(c.amountMinor)}{" "}
                      <small>
                        {Math.round(
                          (c.amountMinor / data.overview.expenseMinor) * 100,
                        )}
                        %
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="empty">За цей період витрат немає.</div>
          )}
        </section>
      </div>
      <section className="panel monthly">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">ДОХОДИ ТА ВИТРАТИ</span>
            <h2>Підсумки за місяцями</h2>
          </div>
          <div className="legend">
            <span>
              <i style={{ background: "#286448" }} />
              Доходи
            </span>
            <span>
              <i style={{ background: "#bd9866" }} />
              Витрати
            </span>
          </div>
        </div>
        <div className="monthly-layout">
          <div
            className="chart monthly-chart"
            role="group"
            aria-label="Порівняння доходів і витрат за місяцями"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.months}
                margin={{ top: 15, right: 10, left: 0, bottom: 0 }}
                barGap={5}
              >
                <CartesianGrid
                  vertical={false}
                  stroke="#e7ebe7"
                  strokeDasharray="3 4"
                />
                <XAxis
                  dataKey="month"
                  tickFormatter={monthLabel}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#63716b", fontSize: 11 }}
                />
                <YAxis
                  width={54}
                  tickFormatter={(v) => `${Math.round(v / 100000)} тис.`}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#63716b", fontSize: 11 }}
                />
                <Tooltip
                  labelFormatter={(v) => monthLabel(String(v))}
                  formatter={(v, name) => [money(Number(v)), name]}
                  cursor={{ fill: "#f2f5f1" }}
                />
                <Bar
                  dataKey="incomeMinor"
                  name="Доходи"
                  fill="#286448"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={42}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="expenseMinor"
                  name="Витрати"
                  fill="#bd9866"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={42}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <aside className="cashflow">
            <span className="eyebrow">ЧИСТИЙ ГРОШОВИЙ ПОТІК</span>
            <strong className={net < 0 ? "negative" : ""}>
              {net > 0 ? "+" : ""}
              {money(net)}
            </strong>
            <p>
              {net >= 0
                ? "Доходи перевищують витрати. Різниця залишається для ваших цілей."
                : "Витрати перевищують доходи за обраний період."}
            </p>
            <span className="transfer-note">
              Внутрішні перекази не включено в доходи й витрати.
            </span>
          </aside>
        </div>
        <DataTable
          headers={["Місяць", "Доходи", "Витрати"]}
          rows={data.months.map((m) => [
            monthLabel(m.month),
            money(m.incomeMinor),
            money(m.expenseMinor),
          ])}
        />
      </section>
    </>
  );
}
