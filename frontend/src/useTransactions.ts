import { useCallback, useEffect, useRef, useState } from "react";
import {
  emptyFilters,
  getTransactions,
  TransactionsError,
  validateTransactionOrder,
  type TransactionFilters,
  type TransactionsResponse,
} from "./transactionsApi";
type Confirmed = TransactionsResponse & { filters: TransactionFilters };
type Attempt = { filters: TransactionFilters; more: boolean };
export function useTransactions() {
  const [state, setState] = useState<{
    data?: Confirmed;
    busy: boolean;
    more: boolean;
    error: string;
    status?: number;
    added: number;
    partial: boolean;
  }>({ busy: true, more: false, error: "", added: 0, partial: false });
  const confirmed = useRef<Confirmed | undefined>(undefined);
  const active = useRef<AbortController | null>(null);
  const pending = useRef<Attempt>({ filters: emptyFilters, more: false });
  const run = useCallback(async (filters: TransactionFilters, more = false) => {
    if (active.current && !active.current.signal.aborted) return false;
    if (more && !confirmed.current?.nextCursor) return false;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const previous = confirmed.current;
    pending.current = { filters: { ...filters }, more };
    setState((s) => ({
      ...s,
      busy: true,
      more,
      error: "",
      status: undefined,
      added: 0,
    }));
    try {
      const result = await getTransactions(
        filters,
        more ? previous!.nextCursor : null,
        AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      );
      if (controller.signal.aborted) return false;
      if (
        more &&
        (result.computedAt !== previous!.computedAt ||
          (result.nextCursor !== null &&
            result.nextCursor === previous!.nextCursor))
      )
        throw new Error("Invalid continuation response. Refresh the list.");
      const items = more ? [...previous!.items, ...result.items] : result.items;
      validateTransactionOrder(items);
      const data = { ...result, items, filters: { ...filters } };
      confirmed.current = data;
      setState({
        data,
        busy: false,
        more: false,
        error: "",
        added: more ? result.items.length : 0,
        partial: result.items.length === 0 && result.nextCursor !== null,
      });
      return true;
    } catch (error) {
      if (!controller.signal.aborted)
        setState((s) => ({
          ...s,
          busy: false,
          error:
            error instanceof Error
              ? error.message
              : "Could not load transactions.",
          status: error instanceof TransactionsError ? error.status : undefined,
        }));
      return false;
    } finally {
      if (active.current === controller) active.current = null;
    }
  }, []);
  useEffect(() => {
    void run(emptyFilters);
    return () => active.current?.abort();
  }, [run]);
  return {
    ...state,
    apply: (q: TransactionFilters) => run(q),
    loadMore: () => run(confirmed.current?.filters ?? emptyFilters, true),
    retry: () => run(pending.current.filters, pending.current.more),
  };
}
