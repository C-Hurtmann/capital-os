import { useCallback, useEffect, useRef, useState } from "react";
import type { CreditLimitResponse, SetCreditLimitRequest } from "./contracts";
import { loadCredit, liveCredit } from "./mockResources";
import { parseSetCreditLimit, postCreditLimit } from "./creditLimit";
/** This resource owns GET/POST ordering; no cross-resource cache or global lock. */
export function useCreditLimit(enabled: boolean) {
  const [state, setState] = useState<{
    data?: CreditLimitResponse;
    loading: boolean;
    error: string;
  }>({ loading: true, error: "" });
  const read = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const writing = useRef(false);
  const mounted = useRef(false);
  const reload = useCallback(async (): Promise<
    CreditLimitResponse | undefined
  > => {
    if (!enabled || writing.current) return;
    read.current?.abort();
    const controller = new AbortController();
    read.current = controller;
    const token = ++generation.current;
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const data = await loadCredit(controller.signal);
      if (
        mounted.current &&
        !controller.signal.aborted &&
        token === generation.current
      ) {
        setState({ data, loading: false, error: "" });
        return data;
      }
    } catch (error) {
      if (
        mounted.current &&
        !controller.signal.aborted &&
        token === generation.current
      )
        setState((s) => ({
          ...s,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Could not load credit limit.",
        }));
    }
  }, [enabled]);
  useEffect(() => {
    mounted.current = true;
    void reload();
    return () => {
      mounted.current = false;
      read.current?.abort();
    };
  }, [reload]);
  const save = useCallback(async (request: SetCreditLimitRequest) => {
    if (writing.current) throw new Error("A save is already in progress.");
    writing.current = true;
    ++generation.current;
    read.current?.abort();
    setState((s) => ({ ...s, loading: false, error: "" }));
    try {
      let data;
      if (liveCredit) data = await postCreditLimit(request);
      else {
        data = parseSetCreditLimit({
          amountMinor: request.amountMinor,
          effectiveFrom: request.effectiveFrom
            ? new Date(request.effectiveFrom).toISOString()
            : new Date().toISOString(),
        });
        if (Date.parse(data.effectiveFrom) > Date.now())
          throw new Error("The effective date must not be in the future.");
        localStorage.setItem(
          "capital-demo-credit-effective-from",
          data.effectiveFrom,
        );
        localStorage.setItem(
          "capital-demo-credit-limit",
          String(data.amountMinor),
        );
      }
      if (mounted.current) setState({ data, loading: false, error: "" });
    } catch (error) {
      if (mounted.current)
        setState((s) => ({
          ...s,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Could not save credit limit.",
        }));
      throw error;
    } finally {
      writing.current = false;
    }
  }, []);
  return { ...state, reload, save };
}
