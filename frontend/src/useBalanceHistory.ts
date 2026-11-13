import { useCallback, useEffect, useRef } from "react";
import type { BalanceHistoryResponse, HistoryPreset } from "./contracts";
import { kyivDay, sliceHistory } from "./balanceHistory";
import { loadHistory, liveHistory } from "./mockResources";
import { useWidget } from "./useWidget";
/** One session/source-scoped response; refresh invalidates before fetching. No TTL/freshness claim. */
export function useBalanceHistory(preset: HistoryPreset, enabled: boolean) {
  const cache = useRef<
    | { data: BalanceHistoryResponse; preset: HistoryPreset; day: string }
    | undefined
  >(undefined);
  const loader = useCallback(
    async (signal: AbortSignal) => {
      const day = kyivDay(Date.now());
      if (cache.current?.day !== day) cache.current = undefined;
      if (cache.current) {
        const sliced = sliceHistory(
          cache.current.data,
          cache.current.preset,
          preset,
        );
        if (sliced) return sliced;
      }
      const data = await loadHistory(preset, signal);
      if (!signal.aborted && (!liveHistory || data.to === day))
        cache.current = { data, preset, day };
      return data;
    },
    [preset],
  );
  const widget = useWidget(loader, enabled);
  const reloadWidget = widget.reload;
  const reload = useCallback(() => {
    cache.current = undefined;
    return reloadWidget();
  }, [reloadWidget]);
  useEffect(() => {
    // Integration seam for the separate successful transaction-sync workflow.
    const invalidate = () => {
      void reload();
    };
    const clear = () => {
      cache.current = undefined;
    };
    window.addEventListener("capital-transactions-synced", invalidate);
    window.addEventListener("pagehide", clear);
    return () => {
      window.removeEventListener("capital-transactions-synced", invalidate);
      window.removeEventListener("pagehide", clear);
    };
  }, [reload]);
  return { ...widget, reload };
}
