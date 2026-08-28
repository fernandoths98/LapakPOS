import { useQuery } from "@tanstack/react-query";
import { HomeAlertsResponse, TodaySummaryResponse } from "@lapak/shared";
import { apiClient } from "./apiClient";
import { useOutletScopeKey } from "../outlet/outletStore";

/** GET /api/sales/summary/today — the active outlet's takings today, tender mix, and change vs yesterday. */
export function useTodaySummary() {
  const outletKey = useOutletScopeKey();
  return useQuery({
    queryKey: ["home", "today-summary", outletKey],
    queryFn: async () => {
      const { data } = await apiClient.get<TodaySummaryResponse>("/api/sales/summary/today");
      return data;
    },
  });
}

/** GET /api/home/alerts — rule-based "needs attention" items (low stock, supplier cost increases). */
export function useHomeAlerts() {
  return useQuery({
    queryKey: ["home", "alerts"],
    queryFn: async () => {
      const { data } = await apiClient.get<HomeAlertsResponse>("/api/home/alerts");
      return data;
    },
  });
}
