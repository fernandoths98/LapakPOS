import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CreateExpenseRequest, Expense } from "@lapak/shared";
import { apiClient } from "./apiClient";

/**
 * POST /api/expenses — attaches to the caller's current shift server-side
 * (opening one with a zero float if none is open yet, same fallback
 * sales.service relies on). Invalidates the current-shift cache so its
 * "Paid out" running total picks the new expense up immediately.
 */
export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateExpenseRequest) => {
      const { data } = await apiClient.post<Expense>("/api/expenses", body);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts", "current"] });
    },
  });
}
