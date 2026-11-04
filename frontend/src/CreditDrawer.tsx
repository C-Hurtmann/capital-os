import { useEffect, useMemo, useRef, useState } from "react";
import type { CreditLimitResponse, SetCreditLimitRequest } from "./contracts";
import { CreditSaveError } from "./creditLimit";
import { uahToMinor, minorToUah, formatMinor } from "./money";
import { effectiveDateLabel, resolveKyivTime } from "./kyivTime";
export default function CreditDrawer({
  current,
  demo,
  onSave,
  onCheck,
  onClose,
}: {
  current: CreditLimitResponse;
  demo: boolean;
  onSave: (request: SetCreditLimitRequest) => Promise<void>;
  onCheck: () => Promise<CreditLimitResponse | undefined>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  const [pending, setPending] = useState<"save" | "check" | null>(null);
  const [draft, setDraft] = useState(() =>
    current.amountMinor === null ? "" : minorToUah(current.amountMinor),
  );
  const [mode, setMode] = useState("now");
  const [localTime, setLocalTime] = useState("");
  const [selectedOffset, setSelectedOffset] = useState("");
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [checked, setChecked] = useState("");
  const resolved = useMemo(() => {
    if (!localTime)
      return { choices: [], error: "Enter a date and time in Europe/Kyiv." };
    try {
      const choices = resolveKyivTime(localTime);
      return {
        choices,
        error: choices.length
          ? ""
          : "This local time does not exist in Europe/Kyiv because the clocks move forward. Choose another time.",
      };
    } catch (error) {
      return { choices: [], error: (error as Error).message };
    }
  }, [localTime]);
  const chosen =
    resolved.choices.length === 1
      ? resolved.choices[0]
      : resolved.choices.find((c) => c.timestamp === selectedOffset);
  const dateInvalid = mode === "specify" && !chosen;
  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => {
      node.close();
      requestAnimationFrame(() =>
        document.getElementById("edit-credit-limit")?.focus(),
      );
    };
  }, []);
  function close() {
    if (!busy.current) onClose();
  }
  async function submit() {
    if (busy.current) return;
    let request: SetCreditLimitRequest;
    try {
      request = { amountMinor: uahToMinor(draft) };
      if (mode === "specify") {
        if (!chosen)
          throw new Error(
            resolved.error ||
              "Choose the UTC offset for this repeated local time.",
          );
        request.effectiveFrom = chosen.timestamp;
      }
    } catch (error) {
      setError((error as Error).message);
      return;
    }
    busy.current = true;
    setPending("save");
    setError("");
    setUncertain(false);
    setChecked("");
    try {
      await onSave(request);
      onClose();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save credit limit.",
      );
      setUncertain(error instanceof CreditSaveError && error.uncertain);
    } finally {
      busy.current = false;
      setPending(null);
    }
  }
  async function check() {
    if (busy.current) return;
    busy.current = true;
    setPending("check");
    setChecked("");
    try {
      const result = await onCheck();
      setChecked(
        result
          ? "Current value checked. This does not prove whether the earlier request completed. Your draft has been kept."
          : "Could not check the current value. Try again when the connection is available.",
      );
    } finally {
      busy.current = false;
      setPending(null);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="credit-drawer"
      aria-labelledby="credit-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div>
        <div className="panel-heading">
          <h2 id="credit-title">Current credit limit</h2>
          <button
            disabled={!!pending}
            onClick={close}
            aria-label="Close credit limit editor"
          >
            Close
          </button>
        </div>
        <div className="credit-confirmed">
          <p>
            Current confirmed limit:{" "}
            <strong>
              {current.amountMinor === null
                ? "Not set"
                : formatMinor(current.amountMinor)}
            </strong>
          </p>
          <p>
            Current effective date:{" "}
            <span>{effectiveDateLabel(current.effectiveFrom)}</span>
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          aria-busy={pending === "save"}
        >
          <fieldset disabled={!!pending} className="credit-fields">
            <legend className="sr-only">Credit limit settings</legend>
            <label>
              Credit limit · UAH
              <input
                autoFocus
                name="limit"
                type="text"
                inputMode="decimal"
                required
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                aria-describedby="credit-money-help"
              />
            </label>
            <p id="credit-money-help" className="helper">
              Use up to two decimal places, without grouping separators. Zero is
              an explicitly set limit.
            </p>
            <fieldset className="credit-date-mode">
              <legend>Effective date</legend>
              <label>
                <input
                  type="radio"
                  name="dateMode"
                  value="now"
                  checked={mode === "now"}
                  onChange={() => setMode("now")}
                />
                Now — server time
              </label>
              <label>
                <input
                  type="radio"
                  name="dateMode"
                  value="specify"
                  checked={mode === "specify"}
                  onChange={() => setMode("specify")}
                />
                Specify date and time
              </label>
            </fieldset>
            {mode === "specify" && (
              <>
                <label>
                  Effective date and time · Europe/Kyiv
                  <input
                    type="datetime-local"
                    step="1"
                    required
                    value={localTime}
                    onChange={(e) => {
                      setLocalTime(e.target.value);
                      setSelectedOffset("");
                    }}
                    aria-describedby="credit-date-help"
                  />
                </label>
                <p id="credit-date-help" className="helper">
                  {resolved.error ||
                    (resolved.choices.length > 1
                      ? "This time occurs twice when the clocks move back. Select its UTC offset."
                      : `${chosen?.offsetLabel} for the selected date. Future dates are rejected by the server.`)}
                </p>
                {resolved.choices.length > 1 && (
                  <label>
                    UTC offset for repeated time
                    <select
                      required
                      value={selectedOffset}
                      onChange={(e) => setSelectedOffset(e.target.value)}
                    >
                      <option value="">Choose an occurrence</option>
                      {resolved.choices.map((c) => (
                        <option key={c.timestamp} value={c.timestamp}>
                          {c.offsetLabel} · {c.utc}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            )}
          </fieldset>
          <p className="helper">
            {demo
              ? "Demo only: saved on this device; Now uses this device’s clock."
              : "Saving in Now mode sets a new server date, even if the amount is unchanged."}{" "}
            This replaces the current setting; it does not create history or
            change bank transactions.
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {uncertain && (
            <div className="credit-uncertain">
              <p className="helper">
                Check the current value before deciding whether to save again.
                Repeating Now intentionally sets a new effective date.
              </p>
              <button
                type="button"
                disabled={!!pending}
                onClick={() => void check()}
              >
                Check current value
              </button>
            </div>
          )}
          {checked && (
            <p role="status" className="helper">
              {checked}
            </p>
          )}
          {pending && (
            <p role="status">
              {pending === "save" ? "Saving…" : "Checking current value…"}
            </p>
          )}
          <div className="drawer-actions">
            <button type="button" disabled={!!pending} onClick={close}>
              Cancel
            </button>
            <button className="primary" disabled={!!pending || dateInvalid}>
              {pending === "save" ? "Saving…" : "Save limit"}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
