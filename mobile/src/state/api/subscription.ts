import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EntitlementsResponse,
  SubscriptionCheckoutRequest,
  SubscriptionInvoiceResponse,
  SubscriptionPlansResponse,
} from "@lapak/shared";
import { apiClient } from "./apiClient";

const ENTITLEMENTS_KEY = ["subscription", "entitlements"] as const;

/** GET /api/subscription/entitlements — the plan's caps + current usage against them. */
export function useEntitlements() {
  return useQuery({
    queryKey: ENTITLEMENTS_KEY,
    queryFn: async () => (await apiClient.get<EntitlementsResponse>("/api/subscription/entitlements")).data,
    staleTime: 60_000,
  });
}

/** GET /api/subscription/plans — every plan + which one the merchant is on. */
export function usePlans() {
  return useQuery({
    queryKey: ["subscription", "plans"],
    queryFn: async () => (await apiClient.get<SubscriptionPlansResponse>("/api/subscription/plans")).data,
    staleTime: 5 * 60_000,
  });
}

/** GET /api/subscription/invoices — recent QRIS checkout invoices; polls while one is pending. */
export function useSubscriptionInvoices(poll = false) {
  return useQuery({
    queryKey: ["subscription", "invoices"],
    queryFn: async () => (await apiClient.get<SubscriptionInvoiceResponse[]>("/api/subscription/invoices")).data,
    refetchInterval: poll ? 3000 : false,
  });
}

/** POST /api/subscription/checkout — creates a QRIS invoice for a paid plan. */
export function useCheckout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: SubscriptionCheckoutRequest) =>
      (await apiClient.post<SubscriptionInvoiceResponse>("/api/subscription/checkout", body)).data,
    onSuccess: () => client.invalidateQueries({ queryKey: ["subscription", "invoices"] }),
  });
}

/** Invalidate entitlements after a plan change lands (webhook flips the invoice to paid). */
export function invalidateEntitlements(client: ReturnType<typeof useQueryClient>): void {
  client.invalidateQueries({ queryKey: ["subscription"] });
  client.invalidateQueries({ queryKey: ["merchant"] });
}
