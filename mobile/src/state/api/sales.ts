import { useMutation, useQueryClient } from "@tanstack/react-query";
import uuid from "react-native-uuid";
import { CreateSaleRequest, Sale } from "@lapak/shared";
import { apiClient } from "./apiClient";

/**
 * A fresh client-generated id per checkout attempt. The backend treats
 * `clientId` as the idempotency key (POST /api/sales returns the existing
 * sale unchanged on a repeat), which is what makes offline-queue retries
 * (Phase 8) and a plain network-retry-on-this-screen both safe: generate it
 * once per attempt and reuse it across retries of *that* attempt, never
 * generate a new one just because the request is being retried.
 */
export function generateClientId(): string {
  return uuid.v4() as string;
}

/**
 * POST /api/sales — invalidates the product list after success so stock
 * counts refresh. Takes `{ body, timeoutMs }` rather than a bare body so
 * CartScreen can pass a short, per-request timeout override (bounding how
 * long it waits before treating the attempt as a network failure and
 * falling back to the offline queue — Phase 8) without touching
 * `apiClient`'s global default that every other call relies on.
 */
export function useCreateSale() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ body, timeoutMs }: { body: CreateSaleRequest; timeoutMs?: number }) => {
      const { data } = await apiClient.post<Sale>("/api/sales", body, timeoutMs !== undefined ? { timeout: timeoutMs } : undefined);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
