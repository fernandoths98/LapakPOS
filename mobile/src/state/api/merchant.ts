import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MerchantResponse } from "@lapak/shared";
import { apiClient } from "./apiClient";

/** GET /api/merchant/me — real merchant name/address/phone for the Home header. */
export function useMerchant() {
  return useQuery({
    queryKey: ["merchant", "me"],
    queryFn: async () => {
      const { data } = await apiClient.get<MerchantResponse>("/api/merchant/me");
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

/** PUT /api/merchant/qris — upload (or with `null`, remove) the shop's own QRIS image. */
export function useSetQrisImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (image: { imageBase64: string; mimeType: string } | null) => {
      const { data } = await apiClient.put<MerchantResponse>("/api/merchant/qris", { image });
      return data;
    },
    onSuccess: (merchant) => queryClient.setQueryData(["merchant", "me"], merchant),
  });
}
