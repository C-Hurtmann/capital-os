import { useState } from "react";
import { labels, transactions, effectiveCategory, saveCategory } from "./data";
import { money, shortDate } from "./format";
const empty = {
  from: "",
  to: "",
  min: "",
  max: "",
  category: "",
  direction: "",
};
export default function Transactions() {
  const [draft, setDraft] = useState(empty),
    [filters, setFilters] = useState(empty),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState<string | null>(null),
    [category, setCategory] = useState(""),
    [message, setMessage] = useState(""),
    [, setVersion] = useState(0),
    [error, setError] = useState("");
  const rows = transactions
    .filter(
      (t) =>
        (!filters.from || t.date >= filters.from) &&
        (!filters.to || t.date <= filters.to) &&
        (!filters.min ||
          Math.abs(t.amountMinor) >= Math.round(Number(filters.min) * 100)) &&
        (!filters.max ||
          Math.abs(t.amountMinor) <= Math.round(Number(filters.max) * 100)) &&
        (!filters.category || effectiveCategory(t) === filters.category) &&
        (!filters.direction ||
          (filters.direction === "income"
            ? t.amountMinor > 0
            : t.amountMinor < 0)),
    )
    .slice()
    .reverse();
  const detail = transactions.find((t) => t.bankId === selected);
  return (
    <>
      <section className="panel transaction-filters">
        <details open>
          <summary>Filter transactions</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (
                (draft.from && draft.to && draft.from > draft.to) ||
                (draft.min &&
                  draft.max &&
                  Number(draft.min) > Number(draft.max))
              ) {
                setError("Check your date and amount ranges.");
                return;
              }
              setError("");
              setFilters(draft);
              setPage(0);
            }}
          >
            <label>
              From
              <input
                type="date"
                min="2025-01-01"
                max="2026-10-29"
                value={draft.from}
                onChange={(e) => setDraft({ ...draft, from: e.target.value })}
              />
            </label>
            <label>
              To
              <input
                type="date"
                min="2025-01-01"
                max="2026-10-29"
                value={draft.to}
                onChange={(e) => setDraft({ ...draft, to: e.target.value })}
              />
            </label>
            <label>
              Minimum · UAH
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.min}
                onChange={(e) => setDraft({ ...draft, min: e.target.value })}
              />
            </label>
            <label>
              Maximum · UAH
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.max}
                onChange={(e) => setDraft({ ...draft, max: e.target.value })}
              />
            </label>
            <label>
              Category
              <select
                aria-label="Filter category"
                value={draft.category}
                onChange={(e) =>
                  setDraft({ ...draft, category: e.target.value })
                }
              >
                <option value="">All categories</option>
                {Object.entries(labels).map(([id, label]) => (
                  <option value={id} key={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Direction
              <select
                aria-label="Direction"
                value={draft.direction}
                onChange={(e) =>
                  setDraft({ ...draft, direction: e.target.value })
                }
              >
                <option value="">Income & expenses</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </label>
            <button className="primary">Apply filters</button>
            <button
              type="button"
              onClick={() => {
                setDraft(empty);
                setFilters(empty);
                setError("");
                setPage(0);
              }}
            >
              Clear
            </button>
          </form>
          <p className="helper">
            Amount filters use absolute UAH amounts, regardless of direction.
          </p>
          {error && <p role="alert">{error}</p>}
        </details>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Account activity</h2>
          <span>{rows.length} transactions</span>
        </div>
        {rows.length ? (
          <>
            <div className="transaction-list">
              {rows.slice(page * 20, page * 20 + 20).map((t) => (
                <button
                  className="transaction-row"
                  key={t.bankId}
                  onClick={() => {
                    setSelected(t.bankId);
                    setCategory(effectiveCategory(t));
                    setMessage("");
                  }}
                >
                  <span
                    className={
                      t.amountMinor > 0
                        ? "transaction-icon positive"
                        : "transaction-icon negative"
                    }
                  >
                    {t.amountMinor > 0 ? "↙" : "↗"}
                  </span>
                  <span>
                    <strong>{labels[effectiveCategory(t)] || "Other"}</strong>
                    <small>
                      {shortDate(t.date)} · {t.bankId}
                      {effectiveCategory(t) !== t.category ? " · Edited" : ""}
                    </small>
                  </span>
                  <span className="transaction-amount">
                    <strong
                      className={t.amountMinor > 0 ? "positive" : "negative"}
                    >
                      {t.amountMinor > 0 ? "+" : ""}
                      {money(t.amountMinor)}
                    </strong>
                    <small>
                      {t.amountMinor > 0 ? "Income" : "Expense"}
                      {t.operationCurrencyCode === 978
                        ? ` · Original EUR ${(t.operationAmountMinor / 100).toFixed(2)}`
                        : ""}
                    </small>
                  </span>
                </button>
              ))}
            </div>
            <div className="pagination">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span>
                Page {page + 1} of {Math.max(1, Math.ceil(rows.length / 20))}
              </span>
              <button
                disabled={(page + 1) * 20 >= rows.length}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </>
        ) : (
          <p className="empty">No transactions match these filters.</p>
        )}
      </section>
      {detail && (
        <section
          className="panel transaction-detail"
          aria-label="Transaction details"
        >
          <div className="panel-heading">
            <h2>Transaction details</h2>
            <button onClick={() => setSelected(null)}>Close details</button>
          </div>
          <dl>
            <dt>Bank ID</dt>
            <dd>{detail.bankId}</dd>
            <dt>Timestamp (UTC)</dt>
            <dd>{detail.timestamp}</dd>
            <dt>Account movement · UAH</dt>
            <dd>{money(detail.amountMinor)}</dd>
            <dt>Original amount</dt>
            <dd>
              {detail.operationCurrencyCode === 978 ? "EUR" : "UAH"}{" "}
              {(detail.operationAmountMinor / 100).toFixed(2)}
            </dd>
            <dt>Bank MCC (unchanged)</dt>
            <dd>{detail.mcc}</dd>
            <dt>Balance after operation</dt>
            <dd>{money(detail.balanceMinor)}</dd>
            <dt>Fee</dt>
            <dd>Not available separately; never added again to expenses.</dd>
          </dl>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              try {
                saveCategory(detail.bankId, category);
                setVersion((v) => v + 1);
                setMessage(
                  "Category saved on this device. Amount and bank MCC are unchanged.",
                );
              } catch {
                setMessage("Could not save category. Please try again.");
              }
            }}
          >
            <label>
              Category
              <select
                aria-label="Transaction category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {Object.entries(labels).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary">Save category</button>
          </form>
          <p role="status">{message}</p>
        </section>
      )}
    </>
  );
}
