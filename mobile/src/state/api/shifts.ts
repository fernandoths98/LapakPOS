import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CloseShiftRequest,
  CloseShiftResponse,
  GetCurrentShiftResponse,
  OpenShiftRequest,
  Shift,
  ZReportResponse,
} from "@lapak/shared";
import { apiClient } from "./apiClient";
import { useOutletScopeKey } from "../outlet/outletStore";

/** Prefix for the open-shift query; the per-outlet key is `[...CURRENT_SHIFT_KEY, outletKey]`. */
const CURRENT_SHIFT_KEY = ["shifts", "current"];

/**
 * GET /api/shifts/current — the merchant's open shift plus its live running
 * totals (opening float / cash sales / PPOB cash in / paid out / expected in
 * drawer), or nulls when nothing is open. This is what lets ShiftCloseScreen
 * show the real numbers immediately, before the cashier has entered a
 * counted-cash figure at all.
 */
export function useCurrentShift() {
  const outletKey = useOutletScopeKey();
  return useQuery({
    queryKey: [...CURRENT_SHIFT_KEY, outletKey],
    queryFn: async () => {
      const { data } = await apiClient.get<GetCurrentShiftResponse>("/api/shifts/current");
      return data;
    },
  });
}

/** POST /api/shifts/open — the explicit, user-initiated start-of-day open. */
export function useOpenShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: OpenShiftRequest) => {
      const { data } = await apiClient.post<Shift>("/api/shifts/open", body);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CURRENT_SHIFT_KEY });
    },
  });
}

/**
 * POST /api/shifts/:id/close — records counted cash and returns the real
 * discrepancy. Invalidates the current-shift cache so the app stops treating
 * this shift as open once it lands.
 */
export function useCloseShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ shiftId, body }: { shiftId: string; body: CloseShiftRequest }) => {
      const { data } = await apiClient.post<CloseShiftResponse>(`/api/shifts/${shiftId}/close`, body);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CURRENT_SHIFT_KEY });
    },
  });
}

/** GET /api/shifts/:id/z-report — the Z-report data (numbers only; thermal printing is Phase 7). */
export function useZReport(shiftId: string | undefined) {
  return useQuery({
    queryKey: ["shifts", "z-report", shiftId],
    enabled: !!shiftId,
    queryFn: async () => {
      const { data } = await apiClient.get<ZReportResponse>(`/api/shifts/${shiftId}/z-report`);
      return data;
    },
  });
}
