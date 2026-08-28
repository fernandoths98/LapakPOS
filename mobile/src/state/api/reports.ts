import { useQuery } from "@tanstack/react-query";
import { OutletReportsResponse } from "@lapak/shared";
import { apiClient } from "./apiClient";

/** GET /api/reports/outlets — per-outlet revenue / txns / low-stock for the trailing `days`. */
export function useOutletReports(days = 7, enabled = true) {
  return useQuery({
    queryKey: ["reports", "outlets", days],
    enabled,
    queryFn: async () =>
      (await apiClient.get<OutletReportsResponse>("/api/reports/outlets", { params: { days } })).data,
    staleTime: 60_000,
  });
}
