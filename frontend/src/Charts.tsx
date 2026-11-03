import { useState, type ReactNode } from "react";
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
import type { HistoryView, SpendingView, MonthlyView } from "./contracts";
import { money, monthLabel, shortDate } from "./format";
const colors = [
  "#6eb594",
  "#b17a38",
  "#567a9b",
  "#8c6596",
  "#8a7736",
  "#677773",
];
export function HistoryChart({
  data,
  historyControls,
}: {
  data: HistoryView;
  historyControls: ReactNode;
}) {
  return (
    <section className="panel timeline">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">YOUR ACCOUNT OVER TIME</span>
          <h2>Balance History</h2>
        </div>
        <span className="unit">UAH</span>
      </div>
      {historyControls}
      {data.coverage === "unavailable" ||
      !data.points.some((p) => p.balanceMinor !== null) ? (
        <div className="empty">Balance history unavailable.</div>
      ) : (
        <div
          className="chart"
          role="group"
          aria-label="Daily account balance. Use left and right arrow keys to explore."
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data.points}
              margin={{ top: 15, right: 12, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#377355" stopOpacity={0.23} />
                  <stop offset="100%" stopColor="#377355" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                stroke="#303b38"
                strokeDasharray="3 4"
              />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                minTickGap={45}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#a5b4ae", fontSize: 11 }}
              />
              <YAxis
                width={54}
                tickFormatter={(v) => `${Math.round(v / 100000)} k`}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#a5b4ae", fontSize: 11 }}
                domain={["auto", "auto"]}
              />
              <Tooltip
                labelFormatter={(v) => shortDate(String(v))}
                formatter={(v) => [money(Number(v)), "Balance"]}
                contentStyle={{
                  borderRadius: 10,
                  border: "1px solid #47554f",
                }}
              />
              <Area
                type="monotone"
                dataKey="balanceMinor"
                stroke="#6eb594"
                strokeWidth={2.5}
                fill="url(#balanceFill)"
                name="Balance"
                connectNulls={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
export function SpendingChart({ data }: { data: SpendingView }) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const selected = data.categories.find((c) => c.id === activeCategory);
  return (
    <section className="panel breakdown">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">
            {shortDate(data.from)} – {shortDate(data.to)} · MONTH TO DATE
          </span>
          <h2>Spending by Category</h2>
        </div>
        <span className="unit">UAH</span>
      </div>
      {data.totalMinor === null || data.coverage === "unavailable" ? (
        <div className="empty">Spending data unavailable.</div>
      ) : data.categories.length ? (
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
                    onClick={(_, index) =>
                      setActiveCategory(
                        data.categories[index].id === activeCategory
                          ? null
                          : data.categories[index].id,
                      )
                    }
                    isAnimationActive={false}
                  >
                    {data.categories.map((c, i) => (
                      <Cell
                        key={c.id}
                        fill={colors[i % colors.length]}
                        opacity={selected && selected.id !== c.id ? 0.35 : 1}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => money(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="donut-label" aria-live="polite">
              <span>{selected ? selected.label : "Total spending"}</span>
              {selected && (
                <small>
                  {Math.round(
                    (selected.amountMinor / (data.totalMinor || 1)) * 100,
                  )}
                  % of monthly spending
                </small>
              )}
              <strong>
                {money(selected ? selected.amountMinor : data.totalMinor)}
              </strong>
            </div>
          </div>
          <label className="category-picker">
            Explore category
            <select
              value={activeCategory || ""}
              onChange={(e) => setActiveCategory(e.target.value || null)}
            >
              <option value="">Total spending</option>
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <div className="empty">No spending this month.</div>
      )}
    </section>
  );
}
export function MonthlyChart({ data }: { data: MonthlyView }) {
  return (
    <section className="panel monthly">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">
            LAST 12 MONTHS · CURRENT MONTH PARTIAL
          </span>
          <h2>Monthly Income & Expenses</h2>
        </div>
        <div className="legend">
          <span>
            <i style={{ background: "#6eb594" }} />
            Income
          </span>
          <span>
            <i style={{ background: "#f28a89" }} />
            Expenses
          </span>
        </div>
      </div>
      {data.coverage === "unavailable" || !data.months.length ? (
        <div className="empty">Monthly cashflow unavailable.</div>
      ) : (
        <div className="monthly-layout">
          <div
            className="chart monthly-chart"
            role="group"
            aria-label="Monthly income and expenses comparison"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.months}
                margin={{ top: 15, right: 10, left: 0, bottom: 0 }}
                barGap={5}
              >
                <CartesianGrid
                  vertical={false}
                  stroke="#303b38"
                  strokeDasharray="3 4"
                />
                <XAxis
                  dataKey="month"
                  tickFormatter={monthLabel}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#a5b4ae", fontSize: 11 }}
                />
                <YAxis
                  width={54}
                  tickFormatter={(v) => `${Math.round(v / 100000)} k`}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#a5b4ae", fontSize: 11 }}
                />
                <Tooltip
                  labelFormatter={(v) => monthLabel(String(v))}
                  formatter={(v, name) => [money(Number(v)), name]}
                  cursor={{ fill: "#25312d" }}
                />
                <Bar
                  dataKey="incomeMinor"
                  name="Income"
                  fill="#6eb594"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={42}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="expenseMinor"
                  name="Expenses"
                  fill="#f28a89"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={42}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  );
}
