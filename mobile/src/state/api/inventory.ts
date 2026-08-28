import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { OutletInventoryItem, UpdateInventoryRequest } from "@lapak/shared";
import { apiClient } from "./apiClient";
import { useOutletStore } from "../outlet/outletStore";

/** GET /api/inventory — the active outlet's own stock/price/availability per product. */
export function useInventory() {
  const outletId = useOutletStore((s) => s.activeOutletId);
  return useQuery({
    queryKey: ["inventory", outletId ?? "token"],
    queryFn: async () => (await apiClient.get<OutletInventoryItem[]>("/api/inventory")).data,
  });
}

/** PATCH /api/inventory/:productId — set this outlet's stock, threshold, override price or availability. */
export function useUpdateInventory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, body }: { productId: string; body: UpdateInventoryRequest }) =>
      (await apiClient.patch<OutletInventoryItem>(`/api/inventory/${productId}`, body)).data,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["inventory"] });
      client.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
