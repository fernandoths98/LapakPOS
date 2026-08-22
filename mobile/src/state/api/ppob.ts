import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckBillRequest,
  CheckBillResponse,
  PayBillRequest,
  PayBillResponse,
  PpobBiller,
  PpobCommissionSummaryResponse,
  PpobTransaction,
  PpobProviderStatusResponse,
  WalletLedgerItem,
  WalletSummaryResponse,
  WalletTopupResponse,
  PrepaidProduct,
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

export type PrepaidCategory = "mobile" | "ewallet" | "electricity" | "games" | "tv_voucher" | "gas";

export function usePrepaidProducts(category: PrepaidCategory, enabled = true) {
  return useQuery({ queryKey: ["ppob", "prepaid-products", category], enabled, staleTime: 10 * 60_000, queryFn: async () => (await apiClient.get<PrepaidProduct[]>("/api/ppob/prepaid-products", { params: { category } })).data });
}

export function useWalletSummary() {
  return useQuery({ queryKey: ["ppob", "wallet"], queryFn: async () => (await apiClient.get<WalletSummaryResponse>("/api/ppob/wallet")).data });
}

export function useWalletLedger(limit = 50) {
  return useQuery({ queryKey: ["ppob", "wallet", "ledger", limit], queryFn: async () => (await apiClient.get<WalletLedgerItem[]>("/api/ppob/wallet/ledger", { params: { limit } })).data });
}

export function useWalletTopups(limit = 20, poll = false) {
  return useQuery({ queryKey: ["ppob", "wallet", "topups", limit], queryFn: async () => (await apiClient.get<WalletTopupResponse[]>("/api/ppob/wallet/topups", { params: { limit } })).data, refetchInterval: poll ? 3000 : false });
}

export function useCreateWalletTopup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (amount: number) => (await apiClient.post<WalletTopupResponse>("/api/ppob/wallet/topups", { amount })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ppob", "wallet", "topups"] }),
  });
}

export function usePpobProviderStatus() {
  return useQuery({
    queryKey: ["ppob", "provider-status"],
    queryFn: async () => {
      const { data } = await apiClient.get<PpobProviderStatusResponse>("/api/ppob/provider-status");
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
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["ppob", "wallet"] });
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
