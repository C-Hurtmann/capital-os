import "./dashboardSkeleton.css";

/** Decorative placeholders; the resource's WidgetStatus announces loading. */
export default function DashboardSkeleton({
  kind = "text",
}: {
  kind?: "text" | "amount" | "history" | "monthly" | "donut";
}) {
  if (kind === "text" || kind === "amount")
    return (
      <span
        aria-hidden="true"
        className={`dashboard-skeleton skeleton-${kind}`}
      />
    );
  return (
    <div
      aria-hidden="true"
      className={`dashboard-skeleton-plot skeleton-${kind}`}
    >
      {kind === "donut" ? (
        <span className="dashboard-skeleton skeleton-ring" />
      ) : (
        <>
          <span className="dashboard-skeleton skeleton-caption" />
          <div className="skeleton-plot-area">
            {kind === "monthly" ? (
              Array.from({ length: 12 }, (_, i) => (
                <span className="skeleton-bar-pair" key={i}>
                  <span className="dashboard-skeleton" />
                  <span className="dashboard-skeleton" />
                </span>
              ))
            ) : (
              <span className="dashboard-skeleton skeleton-series" />
            )}
          </div>
          <div className="skeleton-axis">
            {Array.from({ length: 4 }, (_, i) => (
              <span className="dashboard-skeleton" key={i} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
