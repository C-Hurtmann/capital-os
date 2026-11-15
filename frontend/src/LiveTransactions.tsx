import { useEffect, useRef, useState } from "react";
import { RefreshCw, X, ArrowDownLeft, ArrowUpRight, Minus } from "lucide-react";
import { categoryCatalogue } from "./categoryCatalogue";
import { kyivDay } from "./balanceHistory";
import {
  emptyFilters,
  transactionMoney as money,
  validateTransactionFilters,
  type BankTransaction,
  type TransactionFilters,
} from "./transactionsApi";
import { useTransactions } from "./useTransactions";
import "./transactions.css";
const title = (t: BankTransaction) =>
  t.amountMinor > 0
    ? "Income"
    : t.amountMinor === 0
      ? "Zero-amount transaction"
      : categoryCatalogue[t.categoryId!].label;
const kind = (t: BankTransaction) =>
  t.amountMinor > 0 ? "Income" : t.amountMinor < 0 ? "Expense" : "Zero amount";
const tone = (t: BankTransaction) =>
  t.amountMinor > 0 ? "tx-income" : t.amountMinor < 0 ? "tx-expense" : "";
const date = (t: BankTransaction) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Kyiv",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(t.occurredAt));
const clock = (t: BankTransaction) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Kyiv",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(t.occurredAt));
function Icon({ t }: { t: BankTransaction }) {
  return t.amountMinor > 0 ? (
    <ArrowDownLeft size={16} />
  ) : t.amountMinor < 0 ? (
    <ArrowUpRight size={16} />
  ) : (
    <Minus size={16} />
  );
}
export default function LiveTransactions() {
  const resource = useTransactions();
  const [draft, setDraft] = useState<TransactionFilters>(emptyFilters);
  const [invalid, setInvalid] = useState<
    Partial<Record<"from" | "to", string>>
  >({});
  const [selected, setSelected] = useState<BankTransaction | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null),
    closeButton = useRef<HTMLButtonElement | null>(null),
    heading = useRef<HTMLHeadingElement | null>(null);
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  const data = resource.data,
    rows = data?.items ?? [],
    applied = data?.filters;
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(applied ?? emptyFilters);
  const close = () => {
    setSelected(null);
    requestAnimationFrame(() =>
      opener.current?.isConnected
        ? opener.current.focus()
        : heading.current?.focus(),
    );
  };
  useEffect(() => {
    if (!selected) return;
    closeButton.current?.focus();
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setSelected(null);
        requestAnimationFrame(() =>
          opener.current?.isConnected
            ? opener.current.focus()
            : heading.current?.focus(),
        );
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [selected]);
  async function apply(q: TransactionFilters) {
    const errors = validateTransactionFilters(q);
    setInvalid(errors);
    if (Object.keys(errors).length) {
      document.getElementById(errors.from ? "tx-from" : "tx-to")?.focus();
      return;
    }
    if (await resource.apply(q)) {
      setSelected(null);
      heading.current?.focus();
    }
  }
  async function more(keyboard: boolean) {
    const count = rows.length;
    if (await resource.loadMore()) {
      if (keyboard)
        requestAnimationFrame(() => {
          const buttons = [...rowButtons.current.values()];
          if (buttons[count]) buttons[count].focus();
          else if (
            !document.activeElement ||
            document.activeElement === document.body ||
            (document.activeElement as HTMLButtonElement).disabled
          )
            heading.current?.focus();
        });
    }
  }
  return (
    <div className="tx-console tx-integrated">
      <div className="tx-toolbar">
        <span>Monobank · UAH · Read-only bank records</span>
        <button
          className="tx-button"
          disabled={resource.busy}
          onClick={() => void apply(applied ?? emptyFilters)}
        >
          <RefreshCw size={15} />
          Refresh list
        </button>
      </div>
      <section className="tx-filters" aria-labelledby="filter-title">
        <div className="tx-filter-heading">
          <h2 id="filter-title">Filters</h2>
          <span>Dates in Europe/Kyiv · both dates included</span>
        </div>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void apply(draft);
          }}
        >
          <div className="tx-fields">
            {(["from", "to"] as const).map((key) => (
              <label key={key}>
                {key === "from" ? "From" : "To"}{" "}
                <span className="tx-optional">optional</span>
                <input
                  id={`tx-${key}`}
                  type="date"
                  max={kyivDay(Date.now())}
                  value={draft[key]}
                  disabled={resource.busy}
                  aria-invalid={!!invalid[key]}
                  aria-describedby={`${key}-error date-help`}
                  onChange={(e) => {
                    setDraft({ ...draft, [key]: e.target.value });
                    setInvalid({});
                  }}
                />
                <span className="tx-field-error" id={`${key}-error`}>
                  {invalid[key] || "\u00a0"}
                </span>
              </label>
            ))}
            <label>
              Direction
              <select
                aria-label="Direction"
                value={draft.direction}
                disabled={resource.busy}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    direction: e.target
                      .value as TransactionFilters["direction"],
                  })
                }
              >
                <option value="">All directions</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </label>
            <div className="tx-form-buttons">
              <button className="tx-primary" disabled={resource.busy}>
                {resource.busy && !resource.more
                  ? "Applying…"
                  : "Apply filters"}
              </button>
              <button
                className="tx-link"
                type="button"
                disabled={resource.busy}
                onClick={() => {
                  setDraft(emptyFilters);
                  void apply(emptyFilters);
                }}
              >
                Clear
              </button>
            </div>
          </div>
          <div className="tx-form-bottom">
            <span id="date-help">
              Leave either date blank for an open-ended range.
            </span>
            <span>
              {dirty
                ? "Changes not applied"
                : data
                  ? "Filters applied"
                  : "Filters not yet loaded"}
            </span>
          </div>
        </form>
      </section>
      <div className="tx-result-heading">
        <div>
          <h2 ref={heading} tabIndex={-1}>
            Activity
          </h2>
          <span>
            {data
              ? `${rows.length} loaded`
              : resource.busy
                ? "Loading"
                : "Not loaded"}
          </span>
        </div>
        <p>Newest first · Europe/Kyiv</p>
      </div>
      {applied && (
        <div className="tx-applied">
          <span>Showing</span>
          {[
            applied.from ? `From ${applied.from}` : "Any start date",
            applied.to ? `To ${applied.to}` : "Through request cutoff",
            applied.direction || "All directions",
          ].map((text) => (
            <span className="tx-chip" key={text}>
              {text}
            </span>
          ))}
          <span>
            Request cutoff:{" "}
            <time dateTime={data!.computedAt}>
              {new Intl.DateTimeFormat("en-GB", {
                timeZone: "Europe/Kyiv",
                dateStyle: "medium",
                timeStyle: "medium",
              }).format(new Date(data!.computedAt))}{" "}
              Kyiv
            </time>
          </span>
        </div>
      )}
      <div className="tx-status-slot" role="status">
        {resource.busy && data && !resource.more
          ? "Updating results. Showing the previous results until ready."
          : resource.added
            ? `${resource.added} transactions added.`
            : ""}
      </div>
      {resource.error && (
        <div className="tx-request-error" role="alert">
          <p>
            {resource.error}{" "}
            {data ? "Your previous results are still shown." : ""}
          </p>
          {resource.status === 422 ? (
            <p>
              {resource.more
                ? "This continuation is no longer valid. Refresh the list."
                : "Check the dates and apply the corrected filters."}
            </p>
          ) : (
            <button
              className="tx-button"
              disabled={resource.busy}
              onClick={async (event) => {
                const keyboard = event.detail === 0;
                const count = rows.length;
                if (await resource.retry()) {
                  if (!resource.more) {
                    setSelected(null);
                    heading.current?.focus();
                  } else if (keyboard) {
                    requestAnimationFrame(() => {
                      const next = [...rowButtons.current.values()][count];
                      (next ?? heading.current)?.focus();
                    });
                  }
                }
              }}
            >
              Retry{resource.more ? " loading more" : ""}
            </button>
          )}
        </div>
      )}
      <div className={`tx-content ${selected ? "tx-has-detail" : ""}`}>
        <section
          className="tx-list-panel"
          aria-label="Transaction results"
          aria-busy={resource.busy}
        >
          {!data ? (
            <div className="tx-state">
              <h3>
                {resource.busy
                  ? "Loading transactions…"
                  : "Couldn’t load transactions"}
              </h3>
              <p>Your account activity will appear here.</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="tx-state">
              <h3>
                {data.nextCursor
                  ? "No matches in this batch"
                  : "No transactions to show"}
              </h3>
              <p>
                {data.nextCursor
                  ? "There may be matches further back. Continue to check the next batch."
                  : "No stored transactions match this request."}
              </p>
            </div>
          ) : (
            <table className="tx-table">
              <caption className="tx-visually-hidden">
                Bank transactions, newest first
              </caption>
              <thead>
                <tr>
                  <th scope="col">Transaction</th>
                  <th scope="col">Date & time</th>
                  <th scope="col">Amount</th>
                  <th scope="col" className="tx-balance">
                    Balance after
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr
                    key={t.bankId}
                    className={
                      selected?.bankId === t.bankId ? "tx-selected" : ""
                    }
                  >
                    <td>
                      <div className="tx-ident">
                        <span className={`tx-direction ${tone(t)}`}>
                          <Icon t={t} />
                        </span>
                        <div>
                          <button
                            ref={(el) => {
                              if (el) rowButtons.current.set(t.bankId, el);
                              else rowButtons.current.delete(t.bankId);
                            }}
                            className="tx-row-link"
                            aria-label={`View ${title(t)}, ${money(t.amountMinor, 980, true)}, ${date(t)} ${clock(t)}`}
                            aria-expanded={selected?.bankId === t.bankId}
                            aria-controls={
                              selected?.bankId === t.bankId
                                ? "tx-details"
                                : undefined
                            }
                            onClick={(e) => {
                              opener.current = e.currentTarget;
                              setSelected(t);
                            }}
                          >
                            {title(t)}
                          </button>
                          <small>{kind(t)}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <time dateTime={t.occurredAt}>
                        {date(t)}
                        <small>{clock(t)}</small>
                      </time>
                    </td>
                    <td className={`tx-money ${tone(t)}`}>
                      <b>{money(t.amountMinor, 980, true)}</b>
                      {t.operationCurrencyCode !== 980 && (
                        <small className="tx-original">
                          {money(
                            t.operationAmountMinor,
                            t.operationCurrencyCode,
                            true,
                          )}
                        </small>
                      )}
                    </td>
                    <td className="tx-balance">{money(t.balanceMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {data && (
            <div className="tx-load-area">
              {resource.partial && rows.length > 0 && (
                <p>No new matches in this batch. You can continue checking.</p>
              )}
              {data.nextCursor ? (
                <button
                  className="tx-button"
                  disabled={resource.busy || !!resource.error}
                  onClick={(e) => void more(e.detail === 0)}
                >
                  {resource.busy && resource.more
                    ? "Loading more…"
                    : resource.partial
                      ? "Continue searching"
                      : "View more"}
                </button>
              ) : (
                <p role="status">End of results</p>
              )}
              <small>
                {data.nextCursor
                  ? "Loads the next batch. Existing rows stay in place."
                  : "No more stored transactions for this request."}
              </small>
            </div>
          )}
        </section>
        {selected && (
          <aside
            id="tx-details"
            className="tx-details"
            aria-labelledby="detail-title"
          >
            <div className="tx-detail-header">
              <span className="tx-eyebrow">SELECTED TRANSACTION</span>
              <button
                ref={closeButton}
                className="tx-icon-button"
                aria-label="Close transaction details"
                onClick={close}
              >
                <X size={18} />
              </button>
            </div>
            <h2 id="detail-title">Transaction details</h2>
            <span className={tone(selected)}>{kind(selected)}</span>
            <strong className={`tx-detail-amount ${tone(selected)}`}>
              {money(selected.amountMinor, 980, true)}
            </strong>
            <p className="tx-detail-date">
              {date(selected)} at {clock(selected)}
              <br />
              Europe/Kyiv
            </p>
            <div className="tx-detail-rule" />
            <dl>
              <dt>Category</dt>
              <dd>
                {selected.categoryId ? (
                  <>
                    {categoryCatalogue[selected.categoryId].label}
                    <small>
                      {categoryCatalogue[selected.categoryId].description}
                    </small>
                  </>
                ) : (
                  <>
                    Not applicable
                    <small>
                      Expense categories do not apply to this transaction.
                    </small>
                  </>
                )}
              </dd>
              <dt>Original amount</dt>
              <dd>
                {money(
                  selected.operationAmountMinor,
                  selected.operationCurrencyCode,
                  true,
                )}
              </dd>
              <dt>Balance after transaction</dt>
              <dd>
                {money(selected.balanceMinor)}
                <small>As recorded by the bank.</small>
              </dd>
              <dt>Recorded commission</dt>
              <dd>
                {money(selected.commissionMinor)}
                <small>
                  Recorded value; not added again to the transaction amount.
                </small>
              </dd>
            </dl>
            <details className="tx-bank-details" open>
              <summary>Bank reference</summary>
              <dl>
                <dt>Merchant category code (MCC)</dt>
                <dd>{String(selected.mcc).padStart(4, "0")}</dd>
                <dt>Transaction ID</dt>
                <dd className="tx-bank-id">{selected.bankId}</dd>
              </dl>
            </details>
            <p className="tx-readonly">Read-only bank record</p>
          </aside>
        )}
      </div>
    </div>
  );
}
