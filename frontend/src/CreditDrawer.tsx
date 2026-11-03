import { useEffect, useRef, useState } from "react";
export default function CreditDrawer({
  limit,
  onSave,
  onClose,
}: {
  limit: string;
  onSave: (value: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
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
  return (
    <dialog
      ref={dialog}
      className="credit-drawer"
      aria-labelledby="credit-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div>
        <div className="panel-heading">
          <h2 id="credit-title">Current credit limit</h2>
          <button onClick={onClose} aria-label="Close credit limit editor">
            Close
          </button>
        </div>
        <p className="helper">
          Set the limit currently available on your Monobank account.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const raw = new FormData(e.currentTarget).get("limit") as string;
            if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
              setError("Enter a non-negative amount with up to two decimals.");
              return;
            }
            const [whole, fraction = ""] = raw.split(".");
            const value = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
            if (!Number.isSafeInteger(value)) {
              setError("Amount is too large.");
              return;
            }
            try {
              onSave(String(value));
              onClose();
            } catch {
              setError("Could not save the limit on this device. Try again.");
            }
          }}
        >
          <label>
            Credit limit · UAH
            <input
              autoFocus
              name="limit"
              type="number"
              min="0"
              max="10000000"
              step="0.01"
              required
              defaultValue={limit ? Number(limit) / 100 : undefined}
            />
          </label>
          <p className="helper">
            Saved on this device in demo mode. This does not change bank
            transactions or historical balances.
          </p>
          {error && <p role="alert">{error}</p>}
          <div className="drawer-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary">Save limit</button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
