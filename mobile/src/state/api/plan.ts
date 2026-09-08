import { useQuery } from "@tanstack/react-query";
import { AiFeature, PlanResponse } from "@lapak/shared";
import { apiClient } from "./apiClient";

export const PLAN_KEY = ["plan", "me"];

/**
 * GET /api/plan/me — the merchant's effective plan, what it entitles them to,
 * and how much of today's AI allowance is spent.
 *
 * Deliberately not cached for long: the usage half goes stale the moment the
 * merchant asks the assistant anything, and a stale "4 left" that is really 0
 * makes the app look broken when the backend then refuses.
 */
export function usePlan() {
  return useQuery({
    queryKey: PLAN_KEY,
    queryFn: async () => {
      const { data } = await apiClient.get<PlanResponse>("/api/plan/me");
      return data;
    },
    staleTime: 30_000,
  });
}

/**
 * Whether ads should render. Defaults to hiding them while the plan is still
 * loading or failed to load — showing an ad to a paying merchant because a
 * request was in flight is worse than briefly showing none to a free one.
 */
export function useShowsAds(): boolean {
  const { data } = usePlan();
  return data?.entitlements.showsAds ?? false;
}

/** Calls left today for one feature. Null means unlimited or not yet known. */
export function useAiRemaining(feature: AiFeature): number | null {
  const { data } = usePlan();
  return data?.aiUsageToday.find((u) => u.feature === feature)?.remaining ?? null;
}
