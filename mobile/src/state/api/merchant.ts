import { useQuery } from "@tanstack/react-query";
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
