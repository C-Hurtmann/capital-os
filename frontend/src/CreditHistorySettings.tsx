import { useEffect, useRef, useState } from "react";
import { formatMinor, minorToUah, uahToMinor } from "./money";
import { kyivDay } from "./balanceHistory";
import {
  changeCreditHistory,
  creditHistoryImpact,
  creditOnDate,
  sortedCreditHistory,
  validCreditDate,
  type CreditHistoryEntry,
} from "./creditHistoryModel";
import "./creditHistorySettings.css";

export type CreditHistoryEditor = {
  kind: "quick" | "add" | "edit" | "remove";
  entry?: CreditHistoryEntry;
};
const value = (n: number | null) => (n === null ? "Unknown" : formatMinor(n));
export function CreditHistorySettings({
  entries,
  onEdit,
  onPreview,
  onReset,
}: {
  entries: CreditHistoryEntry[];
  onEdit: (editor: CreditHistoryEditor) => void;
  onPreview: () => void;
  onReset: () => void;
}) {
  const today = kyivDay(Date.now());
  const [lookup, setLookup] = useState(today);
  const [count, setCount] = useState(10);
  const current = creditOnDate(entries, today);
  const sorted = sortedCreditHistory(entries);
  return (
    <div className="credit-history-settings">
      <p className="credit-history-notice" role="note">
        UI preview · Synthetic history stored only for this session. No API
        writes. Date-only API contract pending.{" "}
        <button onClick={onPreview}>Preview on Dashboard</button>
        <button onClick={onReset}>Reset demo history</button>
      </p>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">SETTINGS / CREDIT LIMIT</span>
            <h2>Recorded credit limit</h2>
          </div>
          <button
            onClick={() =>
              onEdit(
                current?.startDate === today
                  ? { kind: "edit", entry: current }
                  : { kind: "quick" },
              )
            }
          >
            {current?.startDate === today
              ? "Edit existing record"
              : current
                ? "Change current limit"
                : "Set limit"}
          </button>
        </div>
        <strong className="credit-history-current">
          {current ? formatMinor(current.amountMinor) : "Not set"}
        </strong>
        <p className="helper">
          {current
            ? `Start date: ${current.startDate} · Europe/Kyiv`
            : "No recorded credit limit."}{" "}
          Manually recorded; does not change your bank limit.
        </p>
      </section>
      <section className="panel" aria-labelledby="credit-history-heading">
        <div className="panel-heading">
          <h2 id="credit-history-heading" tabIndex={-1}>
            Limit history
          </h2>
          <button onClick={() => onEdit({ kind: "add" })}>
            Add past record
          </button>
        </div>
        <div className="credit-history-lookup">
          <label>
            Recorded limit on this date
            <input
              type="date"
              max={today}
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
            />
          </label>
          <output>
            {validCreditDate(lookup) && lookup <= today
              ? value(creditOnDate(entries, lookup)?.amountMinor ?? null)
              : "Choose a valid date no later than today."}
          </output>
        </div>
        {!entries.length ? (
          <p className="empty">
            No recorded credit limit. Set a limit or add a past record.
          </p>
        ) : (
          <div className="credit-history-table">
            <table>
              <caption className="helper">
                Calendar dates in Europe/Kyiv. Until dates are exclusive.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Start date</th>
                  <th scope="col">Until next change</th>
                  <th scope="col">Recorded limit</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted
                  .map((e, i) => ({ ...e, until: sorted[i + 1]?.startDate }))
                  .reverse()
                  .slice(0, count)
                  .map((e) => (
                    <tr key={e.id}>
                      <td>{e.startDate}</td>
                      <td>
                        {e.until
                          ? `${e.until} (exclusive)`
                          : "Until next recorded change"}
                      </td>
                      <td>{formatMinor(e.amountMinor)}</td>
                      <td>
                        <button
                          aria-label={`Edit record ${e.startDate}`}
                          onClick={() => onEdit({ kind: "edit", entry: e })}
                        >
                          Edit
                        </button>
                        <button
                          aria-label={`Remove record ${e.startDate}`}
                          onClick={() => onEdit({ kind: "remove", entry: e })}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        {entries.length > count && (
          <button onClick={() => setCount((c) => c + 10)}>
            View more records
          </button>
        )}
        <p className="helper">
          {sorted[0]
            ? `Unknown before ${sorted[0].startDate}.`
            : "History is unknown until the first recorded date."}{" "}
          Each record applies until the next change. A recorded 0.00 UAH is
          different from Unknown.
        </p>
      </section>
    </div>
  );
}

export function CreditHistoryDialog({
  editor,
  entries,
  onSave,
  onClose,
  onSettings,
}: {
  editor: CreditHistoryEditor;
  entries: CreditHistoryEntry[];
  onSave: (entries: CreditHistoryEntry[]) => void;
  onClose: () => void;
  onSettings: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    title = useRef<HTMLHeadingElement>(null),
    busy = useRef(false);
  const [amount, setAmount] = useState(
    editor.entry
      ? minorToUah(editor.entry.amountMinor)
      : editor.kind === "quick" && creditOnDate(entries, kyivDay(Date.now()))
        ? minorToUah(
            creditOnDate(entries, kyivDay(Date.now()))?.amountMinor ?? 0,
          )
        : "",
  );
  const [startDate, setStartDate] = useState(
    editor.entry?.startDate ??
      (editor.kind === "quick" ? kyivDay(Date.now()) : ""),
  );
  const [error, setError] = useState("");
  const [review, setReview] = useState<{
    before: CreditHistoryEntry[];
    after: CreditHistoryEntry[];
  } | null>(null);
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const today = kyivDay(Date.now());
  const sameDay =
    editor.kind === "quick" &&
    sortedCreditHistory(entries).at(-1)?.startDate === today;
  const remove = editor.kind === "remove";
  useEffect(() => {
    const node = dialog.current!;
    const opener = document.activeElement as HTMLElement;
    node.showModal();
    return () => {
      node.close();
      if (timer.current) clearTimeout(timer.current);
      requestAnimationFrame(() => {
        if (opener.isConnected) opener.focus();
        else document.getElementById("credit-history-heading")?.focus();
      });
    };
  }, []);
  function back() {
    setReview(null);
    setError("");
    requestAnimationFrame(() => title.current?.focus());
  }
  function prepare() {
    if (busy.current) return;
    try {
      const after = remove
        ? entries.filter((e) => e.id !== editor.entry!.id)
        : changeCreditHistory(
            entries,
            {
              id: editor.entry?.id ?? crypto.randomUUID(),
              startDate,
              amountMinor: uahToMinor(amount),
            },
            editor.kind === "quick",
          );
      setError("");
      setReview({ before: entries, after });
      requestAnimationFrame(() => title.current?.focus());
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function save() {
    if (busy.current || !review) return;
    if (review.before !== entries) {
      setReview(null);
      setError("History changed. Review the latest impact before saving.");
      return;
    }
    // Revalidate at confirmation (the Kyiv calendar day may have changed).
    if (!remove && startDate > kyivDay(Date.now())) {
      setError("Choose today or an earlier date.");
      return;
    }
    busy.current = true;
    setPending(true);
    timer.current = setTimeout(() => {
      onSave(review.after);
      busy.current = false;
      onClose();
    }, 350);
  }
  const impact = review ? creditHistoryImpact(review.before, review.after) : [];
  return (
    <dialog
      ref={dialog}
      className="credit-history-dialog"
      aria-labelledby="credit-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy.current) onClose();
      }}
    >
      <div>
        <div className="panel-heading">
          <span className="eyebrow">CREDIT LIMIT · MOCK PREVIEW</span>
          <button
            disabled={pending}
            aria-label="Close credit history editor"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <h2 id="credit-dialog-title" tabIndex={-1} ref={title}>
          {review
            ? "Review history change"
            : remove
              ? "Remove this record?"
              : editor.kind === "edit"
                ? "Edit recorded limit"
                : editor.kind === "quick"
                  ? "Change current limit"
                  : "Add past record"}
        </h2>
        <p className="helper">
          Preview only. Changes reset when the page reloads.
        </p>
        {sameDay ? (
          <>
            <p>
              A limit is already recorded for today. Edit the existing record in
              Settings.
            </p>
            <button
              onClick={() => {
                onClose();
                onSettings();
              }}
            >
              Edit existing record in Settings
            </button>
          </>
        ) : (
          <>
            {review ? (
              <section aria-label="Change impact">
                <h3>Current limit</h3>
                <p>
                  {value(
                    creditOnDate(review.before, today)?.amountMinor ?? null,
                  )}{" "}
                  →{" "}
                  {value(
                    creditOnDate(review.after, today)?.amountMinor ?? null,
                  )}
                </p>
                <h3>Before → After</h3>
                {impact.length ? (
                  <ul className="credit-history-impact">
                    {impact.map((p) => (
                      <li key={p.startDate}>
                        <b>
                          {p.startDate} →{" "}
                          {p.until
                            ? `${p.until} (exclusive)`
                            : "until next recorded change"}
                        </b>
                        <span>
                          {value(p.before)} → {value(p.after)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    No recorded amounts change. Start dates will be saved as
                    shown.
                  </p>
                )}
                {!remove && (
                  <p>
                    Record: {startDate} · {formatMinor(uahToMinor(amount))}
                  </p>
                )}
                {remove && (
                  <p>
                    Removing a record extends the preceding limit until the next
                    change. Before the first remaining record, history is
                    Unknown. Removing the only record leaves the limit Not set.
                  </p>
                )}
              </section>
            ) : remove ? (
              <p>
                Remove {formatMinor(editor.entry!.amountMinor)} starting{" "}
                {editor.entry!.startDate}? Review the resulting periods before
                confirming.
              </p>
            ) : (
              <form
                id="credit-history-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  prepare();
                }}
              >
                <label>
                  Credit limit · UAH
                  <input
                    autoFocus
                    inputMode="decimal"
                    value={amount}
                    disabled={pending}
                    aria-invalid={!!error}
                    aria-describedby="credit-history-error credit-amount-help"
                    onChange={(e) => {
                      setAmount(e.target.value);
                      setError("");
                    }}
                  />
                </label>
                <p className="helper" id="credit-amount-help">
                  0.00 is a recorded zero limit. Blank is not zero.
                </p>
                <label>
                  Start date
                  <input
                    type="date"
                    value={startDate}
                    max={today}
                    disabled={pending}
                    aria-invalid={!!error}
                    aria-describedby="credit-history-error credit-date-help"
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setError("");
                    }}
                  />
                </label>
                <p className="helper" id="credit-date-help">
                  {startDate
                    ? `Applies from ${startDate} until the next recorded change.`
                    : "Enter a verified calendar date in Europe/Kyiv."}
                  {editor.kind === "quick" &&
                    " Must be after the latest recorded start date."}
                </p>
              </form>
            )}
            <p id="credit-history-error" role="alert">
              {error}
            </p>
            <div className="drawer-actions">
              <button disabled={pending} onClick={review ? back : onClose}>
                {review ? "Back" : "Cancel"}
              </button>
              <button
                className="primary"
                disabled={pending}
                onClick={review ? save : prepare}
              >
                {pending
                  ? "Saving preview…"
                  : review
                    ? remove
                      ? "Confirm removal"
                      : "Save limit"
                    : "Review change"}
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
