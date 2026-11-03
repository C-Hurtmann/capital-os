export default function WidgetStatus({
  name,
  loading,
  error,
  hasData,
  retry,
}: {
  name: string;
  loading: boolean;
  error: string;
  hasData: boolean;
  retry: () => void;
}) {
  return (
    <>
      {loading && (
        <div role="status" className={hasData ? "helper" : "widget-skeleton"}>
          {hasData ? "Updating… Previous values shown." : `Loading ${name}…`}
        </div>
      )}
      {error && (
        <div role="alert" className="helper">
          {error} {hasData && "Showing previously loaded data."}{" "}
          <button onClick={retry}>Retry {name}</button>
        </div>
      )}
    </>
  );
}
