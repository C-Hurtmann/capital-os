import { useEffect, useLayoutEffect, useRef, useState, useId } from "react";
import { createPortal } from "react-dom";
import { Info, X } from "lucide-react";
import type { SpendingView } from "./contracts";
import { categoryCatalogue } from "./categoryCatalogue";
import {
  chartHelp,
  groupSpending,
  OTHERS_ID,
  othersCopy,
  spendingPercent,
  type SpendingSector,
} from "./spending";
import { money, shortDate } from "./format";

/** Fit the formatted amount to the donut hole without rounding or truncation. */
function DonutAmount({ amountMinor }: { amountMinor: number }) {
  const element = useRef<HTMLElement>(null);
  const text = money(amountMinor);
  useLayoutEffect(() => {
    const node = element.current;
    const container = node?.parentElement;
    if (!node || !container) return;
    let disposed = false;
    const fit = () => {
      if (disposed) return;
      // Reset to the CSS size so shorter amounts can grow back after selection.
      node.style.removeProperty("font-size");
      const maximum = parseFloat(getComputedStyle(node).fontSize);
      const available = container.clientWidth;
      const required = node.getBoundingClientRect().width;
      if (required > available && available > 0) {
        node.style.fontSize = `${Math.floor(((maximum * available) / required) * 100) / 100}px`;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    document.fonts.ready.then(fit);
    document.fonts.addEventListener("loadingdone", fit);
    return () => {
      disposed = true;
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", fit);
    };
  }, [text]);
  return <strong ref={element}>{text}</strong>;
}

function copy(id: string) {
  return id === OTHERS_ID
    ? othersCopy
    : (categoryCatalogue[id] ?? {
        label: `Category ${id}`,
        description: "Category details are not available in this version.",
        color: "#A6B7C7",
      });
}
function arc(start: number, end: number) {
  const point = (angle: number, r: number) =>
    `${150 + r * Math.sin(angle)},${150 - r * Math.cos(angle)}`;
  const large = end - start > Math.PI ? 1 : 0;
  return `M${point(start, 132)} A132,132 0 ${large} 1 ${point(end, 132)} L${point(end, 103)} A103,103 0 ${large} 0 ${point(start, 103)} Z`;
}
type Explanation = { id: string; anchor: Element; pinned: boolean };
function ExplanationPanel({
  state,
  data,
  total,
  panelId,
  dismiss,
  hold,
  release,
}: {
  state: Explanation;
  data?: SpendingSector;
  total: number;
  panelId: string;
  dismiss: (restore: boolean) => void;
  hold: () => void;
  release: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ top: 8, left: 8 });
  const info =
    state.id === "chart-help"
      ? { label: "About spending categories", description: chartHelp }
      : copy(state.id);
  useLayoutEffect(() => {
    const place = () => {
      const box = state.anchor.getBoundingClientRect();
      const element = panel.current;
      if (!element) return;
      const viewport = window.visualViewport;
      const width = viewport?.width ?? innerWidth;
      const height = viewport?.height ?? innerHeight;
      const x = viewport?.offsetLeft ?? 0;
      const y = viewport?.offsetTop ?? 0;
      element.style.maxWidth = `${Math.max(1, width - 16)}px`;
      const naturalHeight =
        (element
          .querySelector(".spending-explanation-heading")
          ?.getBoundingClientRect().height ?? 0) +
        (element.querySelector(".spending-explanation-body")?.scrollHeight ??
          0) +
        30;
      const below = y + height - box.bottom - 16;
      const above = box.top - y - 16;
      const openBelow = below >= naturalHeight || below >= above;
      // Keep transient explanations off their trigger: hover/focus must not
      // intercept the pointer between pointerdown and click on a short screen.
      const available = state.pinned
        ? height - 16
        : Math.max(48, openBelow ? below : above);
      element.style.maxHeight = `${available}px`;
      const size = element.getBoundingClientRect();
      setPosition({
        left: Math.max(x + 8, Math.min(box.left, x + width - size.width - 8)),
        top: Math.max(
          y + 8,
          Math.min(
            openBelow ? box.bottom + 8 : box.top - size.height - 8,
            y + height - size.height - 8,
          ),
        ),
      });
    };
    place();
    const observer = new ResizeObserver(place);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    if (state.pinned) close.current?.focus();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
    };
  }, [state]);
  return createPortal(
    <div
      ref={panel}
      id={panelId}
      className="spending-explanation"
      style={position}
      role={state.pinned ? "dialog" : "tooltip"}
      aria-label={state.pinned ? info.label : undefined}
      onPointerEnter={hold}
      onPointerLeave={() => {
        if (!state.pinned) release();
      }}
    >
      <div className="spending-explanation-heading">
        <strong>{info.label}</strong>
        {state.pinned && (
          <button
            ref={close}
            type="button"
            className="spending-info"
            aria-label="Close explanation"
            onClick={() => dismiss(true)}
          >
            <X size={18} />
          </button>
        )}
      </div>
      <div className="spending-explanation-body">
        {data && (
          <p className="spending-explanation-value">
            {money(data.amountMinor)} ·{" "}
            {spendingPercent(data.amountMinor, total)}
          </p>
        )}
        {state.id === "other" && <p>Unknown merchant category</p>}
        {data?.members && <p>{data.members.length} categories combined</p>}
        <p>{info.description}</p>
        {state.pinned && data?.members && (
          <ul
            className="spending-popover-breakdown"
            aria-label="Categories in Others"
          >
            {data.members.map((c) => (
              <li key={c.id}>
                <span>{copy(c.id).label}</span>
                <span>
                  {money(c.amountMinor)} ·{" "}
                  {spendingPercent(c.amountMinor, total)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function SpendingChart({ data }: { data: SpendingView }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const card = useRef<HTMLElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const suppressFocus = useRef(false);
  const panelId = useId();
  const total = data.totalMinor ?? 0;
  let sectors: SpendingSector[] = [];
  let invalid = data.totalMinor === null || data.coverage === "unavailable";
  try {
    if (!invalid) sectors = groupSpending(data.categories, total);
  } catch {
    invalid = true;
  }
  const others = sectors.find((c) => c.id === OTHERS_ID);
  const all = [...sectors, ...(others?.members ?? [])];
  const active = all.find((c) => c.id === selected);
  const highlighted = explanation?.id ?? active?.id;
  const hold = () => clearTimeout(timer.current);
  const release = () => {
    hold();
    timer.current = setTimeout(
      () => setExplanation((current) => (current?.pinned ? current : null)),
      150,
    );
  };
  const dismiss = (restore: boolean) => {
    hold();
    const anchor = explanation?.anchor;
    setExplanation(null);
    if (
      restore &&
      (anchor instanceof HTMLElement || anchor instanceof SVGElement) &&
      anchor.isConnected
    ) {
      suppressFocus.current = true;
      anchor.focus();
      suppressFocus.current = false;
    }
  };
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dismiss(true);
        if (!explanation) setSelected(null);
      }
    };
    const outside = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        document.getElementById(panelId)?.contains(target) ||
        explanation?.anchor.contains(target)
      )
        return;
      if (explanation?.pinned) dismiss(false);
      if (!card.current?.contains(target)) setSelected(null);
    };
    const blur = (e: FocusEvent) => {
      if (!explanation?.pinned) return;
      const target = e.target as Node;
      if (
        !document.getElementById(panelId)?.contains(target) &&
        !explanation.anchor.contains(target)
      )
        dismiss(false);
    };
    document.addEventListener("keydown", escape);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", blur);
    return () => {
      document.removeEventListener("keydown", escape);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", blur);
    };
  });
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = (id: string, anchor: Element, pinned = false) => {
    hold();
    if (suppressFocus.current || (explanation?.pinned && !pinned)) return;
    setExplanation({ id, anchor, pinned });
  };
  const select = (id: string) => {
    setSelected((current) => (current === id ? null : id));
  };
  const infoButton = (id: string) => (
    <button
      type="button"
      className="spending-info"
      aria-label={
        id === "chart-help"
          ? "About spending categories"
          : `About ${copy(id).label}`
      }
      aria-haspopup="dialog"
      aria-expanded={explanation?.pinned === true && explanation.id === id}
      aria-controls={
        explanation?.pinned && explanation.id === id ? panelId : undefined
      }
      onClick={(e) => {
        if (explanation?.pinned && explanation.id === id) dismiss(false);
        else show(id, e.currentTarget, true);
      }}
    >
      <Info size={16} />
    </button>
  );
  let angle = 0;
  return (
    <section
      ref={card}
      className="panel breakdown spending-panel"
      aria-label="Spending by Category"
    >
      <div className="panel-heading">
        <div>
          <span className="eyebrow">
            {shortDate(data.from)} – {shortDate(data.to)} · MONTH TO DATE
          </span>
          <h2>Spending by Category</h2>
        </div>
        {infoButton("chart-help")}
      </div>
      <p className="spending-demo">Demo data · UAH</p>
      {invalid ? (
        <div className="empty" role="status">
          Spending data unavailable. Category totals could not be verified.
        </div>
      ) : (
        <>
          <div className="spending-ring-wrap">
            <svg
              className="spending-ring"
              viewBox="0 0 300 300"
              role="group"
              aria-label="Spending categories"
            >
              {!total && (
                <circle
                  cx="150"
                  cy="150"
                  r="117.5"
                  fill="none"
                  stroke="#46534d"
                  strokeWidth="29"
                />
              )}
              {sectors.map((c) => {
                const start = angle;
                angle += (c.amountMinor / total) * Math.PI * 2;
                const matching =
                  highlighted === c.id ||
                  c.members?.some((m) => m.id === highlighted);
                const props = {
                  fill: copy(c.id).color,
                  stroke: matching ? "#E8ECEA" : "#1c2521",
                  strokeWidth: matching ? 3 : 2,
                  opacity: highlighted && !matching ? 0.5 : 1,
                  role: "button",
                  tabIndex: 0,
                  "aria-label": `${copy(c.id).label}, ${money(c.amountMinor)}, ${spendingPercent(c.amountMinor, total)}`,
                  "aria-pressed": active?.id === c.id,
                  "aria-haspopup": "dialog" as const,
                  onClick: (e: React.MouseEvent<SVGElement>) => {
                    select(c.id);
                    show(c.id, e.currentTarget, true);
                  },
                  onKeyDown: (e: React.KeyboardEvent<SVGElement>) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      select(c.id);
                      show(c.id, e.currentTarget, true);
                    }
                  },
                  onFocus: (e: React.FocusEvent<SVGElement>) =>
                    show(c.id, e.currentTarget),
                  onBlur: release,
                  onPointerEnter: (e: React.PointerEvent<SVGElement>) => {
                    if (e.pointerType !== "touch") show(c.id, e.currentTarget);
                  },
                  onPointerLeave: release,
                };
                return sectors.length === 1 ? (
                  <circle
                    key={c.id}
                    cx="150"
                    cy="150"
                    r="117.5"
                    {...props}
                    fill="none"
                    stroke={copy(c.id).color}
                    strokeWidth="29"
                  />
                ) : (
                  <path key={c.id} d={arc(start, angle)} {...props} />
                );
              })}
            </svg>
            <div className="spending-center" aria-live="polite">
              <span>{active ? copy(active.id).label : "Total spending"}</span>
              <DonutAmount amountMinor={active ? active.amountMinor : total} />
              {active && (
                <small>
                  {spendingPercent(active.amountMinor, total)} of monthly
                  spending
                </small>
              )}
            </div>
          </div>
          {!total && <p className="empty">No spending this month</p>}
        </>
      )}
      {explanation && (
        <ExplanationPanel
          state={explanation}
          data={all.find((c) => c.id === explanation.id)}
          total={total}
          panelId={panelId}
          dismiss={dismiss}
          hold={hold}
          release={release}
        />
      )}
    </section>
  );
}
