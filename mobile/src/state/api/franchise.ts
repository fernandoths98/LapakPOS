import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FranchiseAgreementDto,
  FranchiseRoyaltyStatementDto,
  GenerateStatementsRequest,
  GenerateStatementsResponse,
  UpsertFranchiseAgreementRequest,
} from "@lapak/shared";
import { apiClient } from "./apiClient";

const AGREEMENTS_KEY = ["franchise", "agreements"] as const;
const STATEMENTS_KEY = ["franchise", "statements"] as const;

export function useFranchiseAgreements(enabled = true) {
  return useQuery({
    queryKey: AGREEMENTS_KEY,
    enabled,
    queryFn: async () => (await apiClient.get<FranchiseAgreementDto[]>("/api/franchise/agreements")).data,
  });
}

export function useFranchiseStatements(enabled = true) {
  return useQuery({
    queryKey: STATEMENTS_KEY,
    enabled,
    queryFn: async () => (await apiClient.get<FranchiseRoyaltyStatementDto[]>("/api/franchise/statements")).data,
  });
}

export function useUpsertFranchiseAgreement() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpsertFranchiseAgreementRequest) =>
      (await apiClient.post<FranchiseAgreementDto>("/api/franchise/agreements", body)).data,
    onSuccess: () => client.invalidateQueries({ queryKey: ["franchise"] }),
  });
}

export function useGenerateStatements() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: GenerateStatementsRequest) =>
      (await apiClient.post<GenerateStatementsResponse>("/api/franchise/statements/generate", body)).data,
    onSuccess: () => client.invalidateQueries({ queryKey: STATEMENTS_KEY }),
  });
}

export function useSetStatementStatus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "issued" | "paid" }) =>
      (await apiClient.patch<FranchiseRoyaltyStatementDto>(`/api/franchise/statements/${id}`, { status })).data,
    onSuccess: () => client.invalidateQueries({ queryKey: STATEMENTS_KEY }),
  });
}
