import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AskHistoryResponse, AskResponse, DailyRecapResponse, WeeklyReportsResponse } from "@lapak/shared";
import { apiClient } from "./apiClient";

const DAILY_RECAP_KEY = ["recap", "daily"];
const WEEKLY_REPORTS_KEY = ["recap", "weekly"];
const ASK_HISTORY_KEY = ["recap", "ask", "history"];

/**
 * GET /api/recap/daily — today's Story-tab recap. `aiAvailable: false` means
 * the backend has no `ANTHROPIC_API_KEY` configured and this is the honest,
 * deterministic (non-AI) summary, never a fake-looking blank state.
 */
export function useDailyRecap() {
  return useQuery({
    queryKey: DAILY_RECAP_KEY,
    queryFn: async () => {
      const { data } = await apiClient.get<DailyRecapResponse>("/api/recap/daily");
      return data;
    },
  });
}

/** POST /api/recap/daily/regenerate — clears today's cached recap and forces a fresh one. */
export function useRegenerateRecap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<DailyRecapResponse>("/api/recap/daily/regenerate", {});
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(DAILY_RECAP_KEY, data);
    },
  });
}

/** GET /api/recap/reports/weekly — the Reports tab's 7-day bars + top sellers. Pure SQL, no AI. */
export function useWeeklyReports() {
  return useQuery({
    queryKey: WEEKLY_REPORTS_KEY,
    queryFn: async () => {
      const { data } = await apiClient.get<WeeklyReportsResponse>("/api/recap/reports/weekly");
      return data;
    },
  });
}

/** GET /api/recap/ask/history — the Ask tab's persisted chat thread, oldest first. */
export function useAskChatHistory() {
  return useQuery({
    queryKey: ASK_HISTORY_KEY,
    queryFn: async () => {
      const { data } = await apiClient.get<AskHistoryResponse>("/api/recap/ask/history");
      return data;
    },
  });
}

/**
 * POST /api/recap/ask — sends one chat message. `aiAvailable: false` on the
 * response means it's the honest "AI isn't available"/"couldn't reach the AI
 * assistant" fallback, never a real Claude answer — the merchant's own
 * question is always persisted regardless, so history is refetched either way.
 */
export function useAskChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (message: string) => {
      const { data } = await apiClient.post<AskResponse>("/api/recap/ask", { message });
      return data;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ASK_HISTORY_KEY });
    },
  });
}
