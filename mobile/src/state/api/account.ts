import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AccountSetupResponse, CreateOutletRequest, CreateStaffRequest, OutletDto, StaffDto } from "@lapak/shared";
import { apiClient } from "./apiClient";

const ACCOUNT_SETUP_KEY = ["merchant", "account-setup"] as const;

export function useAccountSetup() {
  return useQuery({ queryKey: ACCOUNT_SETUP_KEY, queryFn: async () => (await apiClient.get<AccountSetupResponse>("/api/merchant/account-setup")).data });
}
export function useCreateOutlet() {
  const client = useQueryClient();
  return useMutation({ mutationFn: async (body: CreateOutletRequest) => (await apiClient.post<OutletDto>("/api/merchant/outlets", body)).data, onSuccess: () => client.invalidateQueries({ queryKey: ACCOUNT_SETUP_KEY }) });
}
export function useCreateStaff() {
  const client = useQueryClient();
  return useMutation({ mutationFn: async (body: CreateStaffRequest) => (await apiClient.post<StaffDto>("/api/merchant/staff", body)).data, onSuccess: () => client.invalidateQueries({ queryKey: ACCOUNT_SETUP_KEY }) });
}
