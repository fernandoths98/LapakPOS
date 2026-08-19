import { useQuery } from "@tanstack/react-query";
import { HomeAlertsResponse, TodaySummaryResponse } from "@lapak/shared";
import { apiClient } from "./apiClient";

/** GET /api/sales/summary/today — today's takings total, tender mix, and change vs yesterday. */
export function useTodaySummary() {
  return useQuery({
    queryKey: ["home", "today-summary"],
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
