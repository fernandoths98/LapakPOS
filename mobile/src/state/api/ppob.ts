import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckBillRequest,
  CheckBillResponse,
  PayBillRequest,
  PayBillResponse,
  PpobBiller,
  PpobCommissionSummaryResponse,
  PpobTransaction,
} from "@lapak/shared";
import { apiClient } from "./apiClient";

/** GET /api/ppob/billers — active billers for the merchant, in the prototype's fixed grid order. */
export function useBillers() {
  return useQuery({
    queryKey: ["ppob", "billers"],
    queryFn: async () => {
      const { data } = await apiClient.get<PpobBiller[]>("/api/ppob/billers");
      return data;
    },
  });
}

/**
 * POST /api/ppob/check-bill — the first tap of the two-step flow. Returns a
 * redeemable `checkRef` alongside the honest quote (bill + admin fee +
 * merchant margin) for `usePayBill` to charge.
 */
export function useCheckBill() {
  return useMutation({
    mutationFn: async (body: CheckBillRequest) => {
      const { data } = await apiClient.post<CheckBillResponse>("/api/ppob/check-bill", body);
      return data;
    },
  });
}

/**
 * POST /api/ppob/pay-bill — the second tap, redeeming a `checkRef` from
 * `useCheckBill`. Invalidates the recent-transactions and commission-summary
 * caches so Bills reflects the new payment immediately on the way back.
 */
export function usePayBill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: PayBillRequest) => {
      const { data } = await apiClient.post<PayBillResponse>("/api/ppob/pay-bill", body);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ppob", "transactions"] });
      queryClient.invalidateQueries({ queryKey: ["ppob", "commission-summary"] });
    },
  });
}

/** GET /api/ppob/transactions?limit= — most recent PPOB transactions, newest first. */
export function usePpobTransactions(limit = 20) {
  return useQuery({
    queryKey: ["ppob", "transactions", limit],
    queryFn: async () => {
      const { data } = await apiClient.get<PpobTransaction[]>("/api/ppob/transactions", { params: { limit } });
      return data;
    },
  });
}

/** GET /api/ppob/commission/summary?month= — defaults to the current month server-side. */
export function usePpobCommissionSummary(month?: string) {
  return useQuery({
    queryKey: ["ppob", "commission-summary", month ?? "current"],
    queryFn: async () => {
      const { data } = await apiClient.get<PpobCommissionSummaryResponse>("/api/ppob/commission/summary", {
        params: month ? { month } : undefined,
      });
      return data;
    },
  });
}
