import { useCallback, useEffect, useRef, useState } from "react";
/** Small per-widget request lifecycle, not a shared resource cache. */
export function useWidget<T>(
  load: (signal: AbortSignal) => Promise<T>,
  enabled = true,
) {
  const [state, setState] = useState<{
    data?: T;
    loading: boolean;
    error: string;
  }>({ loading: true, error: "" });
  const active = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    if (!enabled) return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const data = await load(controller.signal);
      if (!controller.signal.aborted)
        setState({ data, loading: false, error: "" });
    } catch (error) {
      if (!controller.signal.aborted)
        setState((s) => ({
          ...s,
          loading: false,
          error:
            error instanceof Error ? error.message : "Could not load data.",
        }));
    }
  }, [load, enabled]);
  useEffect(() => {
    void reload();
    return () => active.current?.abort();
  }, [reload]);
  return { ...state, reload };
}
