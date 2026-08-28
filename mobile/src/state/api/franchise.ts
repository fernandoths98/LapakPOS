import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CatalogSyncResult,
  CreatePartnerInviteRequest,
  FranchiseAgreementDto,
  FranchiseMembershipResponse,
  FranchiseePartnerDto,
  FranchiseePartnerStatementDto,
  FranchiseRoyaltyStatementDto,
  GenerateStatementsRequest,
  GenerateStatementsResponse,
  UpsertFranchiseAgreementRequest,
} from "@lapak/shared";
import { apiClient } from "./apiClient";

const AGREEMENTS_KEY = ["franchise", "agreements"] as const;
const STATEMENTS_KEY = ["franchise", "statements"] as const;
const PARTNERS_KEY = ["franchise", "partners"] as const;
const PARTNER_STATEMENTS_KEY = ["franchise", "partner-statements"] as const;
const MEMBERSHIP_KEY = ["franchise", "membership"] as const;

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

// ── Inter-tenant partners ──────────────────────────────────────────────

export function usePartners(enabled = true) {
  return useQuery({
    queryKey: PARTNERS_KEY,
    enabled,
    queryFn: async () => (await apiClient.get<FranchiseePartnerDto[]>("/api/franchise/partners")).data,
  });
}

export function usePartnerStatements(enabled = true) {
  return useQuery({
    queryKey: PARTNER_STATEMENTS_KEY,
    enabled,
    queryFn: async () => (await apiClient.get<FranchiseePartnerStatementDto[]>("/api/franchise/partners/statements")).data,
  });
}

export function useCreatePartnerInvite() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreatePartnerInviteRequest) =>
      (await apiClient.post<FranchiseePartnerDto>("/api/franchise/partners/invite", body)).data,
    onSuccess: () => client.invalidateQueries({ queryKey: PARTNERS_KEY }),
  });
}

export function useEndPartner() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.post<FranchiseePartnerDto>(`/api/franchise/partners/${id}/end`, {})).data,
    onSuccess: () => client.invalidateQueries({ queryKey: PARTNERS_KEY }),
  });
}

export function useSyncPartnerCatalog() {
  const client = useQueryClient();
  return useMutation({
    // `id` omitted → push to every active partner.
    mutationFn: async (id?: string) =>
      id
        ? [(await apiClient.post<CatalogSyncResult>(`/api/franchise/partners/${id}/sync-catalog`, {})).data]
        : (await apiClient.post<CatalogSyncResult[]>("/api/franchise/partners/sync-catalog", {})).data,
    onSuccess: () => client.invalidateQueries({ queryKey: PARTNERS_KEY }),
  });
}

export function useGeneratePartnerStatements() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: GenerateStatementsRequest) =>
      (await apiClient.post<{ created: number; updated: number; statements: FranchiseePartnerStatementDto[] }>(
        "/api/franchise/partners/statements/generate",
        body,
      )).data,
    onSuccess: () => client.invalidateQueries({ queryKey: PARTNER_STATEMENTS_KEY }),
  });
}

export function useSetPartnerStatementStatus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "issued" | "paid" }) =>
      (await apiClient.patch<FranchiseePartnerStatementDto>(`/api/franchise/partners/statements/${id}`, { status })).data,
    onSuccess: () => client.invalidateQueries({ queryKey: PARTNER_STATEMENTS_KEY }),
  });
}

// ── Franchisee membership ──────────────────────────────────────────────

export function useMembership() {
  return useQuery({
    queryKey: MEMBERSHIP_KEY,
    queryFn: async () => (await apiClient.get<FranchiseMembershipResponse>("/api/franchise/membership")).data,
  });
}

export function useJoinFranchise() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) =>
      (await apiClient.post<FranchiseMembershipResponse>("/api/franchise/join", { code })).data,
    onSuccess: () => client.invalidateQueries({ queryKey: MEMBERSHIP_KEY }),
  });
}
