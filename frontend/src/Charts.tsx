import { type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  BalanceHistoryResponse,
  MonthlyCashflowResponse,
} from "./contracts";
import { money, monthLabel, shortDate, bankTimestamp } from "./format";
import { dayNumber, dayString, DAY_MS } from "./balanceHistory";
export { SpendingChart } from "./SpendingChart";
export function HistoryChart({
  data,
  historyControls,
}: {
  data: BalanceHistoryResponse;
  historyControls: ReactNode;
}) {
  const points = data.points.map((p) => ({ ...p, x: dayNumber(p.date) }));
  const firstKnown = data.points.find((p) => p.balanceMinor !== null);
  const start = data.from ? dayNumber(data.from) : dayNumber(data.to);
  const end = dayNumber(data.to);
  const single = start === end;
  const dateLabel = (v: number) => shortDate(dayString(v));
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
      {data.points[0]?.balanceMinor === null && firstKnown && (
        <p className="helper">No data before {firstKnown.date}.</p>
      )}
      {!firstKnown ? (
        <div className="empty">No data.</div>
      ) : (
        <div
          className="chart"
          role="group"
          aria-label="Daily account balance. Use left and right arrow keys to explore."
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={points}
              accessibilityLayer
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
                dataKey="x"
                type="number"
                scale="time"
                domain={
                  single ? [start - DAY_MS / 2, end + DAY_MS / 2] : [start, end]
                }
                ticks={single ? [start] : undefined}
                allowDataOverflow
                tickFormatter={dateLabel}
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
                labelFormatter={(v) => dayString(Number(v))}
                formatter={(v) => [
                  v == null ? "No data" : money(Number(v)),
                  "Balance",
                ]}
                contentStyle={{
                  borderRadius: 10,
                  border: "1px solid #47554f",
                }}
              />
              <Area
                type="linear"
                dataKey="balanceMinor"
                stroke="#6eb594"
                strokeWidth={2.5}
                dot={
                  data.points.filter((p) => p.balanceMinor !== null).length ===
                  1
                    ? { r: 4 }
                    : false
                }
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
export function MonthlyChart({ data }: { data: MonthlyCashflowResponse }) {
  return (
    <section className="panel monthly">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">
            12 MONTHS · {monthLabel(data.months[11].month)} THROUGH {data.to}
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
      <p className="helper">
        {data.from} – {data.to} · Stored transaction totals · Calculated{" "}
        <time dateTime={data.computedAt}>{bankTimestamp(data.computedAt)}</time>
      </p>
      {!data.months.length ? (
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
                accessibilityLayer
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
                  interval={0}
                  angle={-60}
                  textAnchor="end"
                  height={70}
                  tickFormatter={monthLabel}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#a5b4ae", fontSize: 11 }}
                />
                <YAxis
                  width={54}
                  domain={
                    data.months.every(
                      (m) => m.incomeMinor === 0 && m.expenseMinor === 0,
                    )
                      ? [0, 100]
                      : [0, "auto"]
                  }
                  tickFormatter={(v) =>
                    v === 0
                      ? "0"
                      : Math.abs(v) < 100000
                        ? `${v / 100}`
                        : `${Math.round(v / 100000)} k`
                  }
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
