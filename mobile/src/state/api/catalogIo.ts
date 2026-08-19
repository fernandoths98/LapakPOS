import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ImportCommitRequest,
  ImportCommitResponse,
  ImportPreviewRequest,
  ImportPreviewResponse,
} from "@lapak/shared";
import ReactNativeBlobUtil from "react-native-blob-util";
import Share from "react-native-share";
import { API_BASE_URL, apiClient } from "./apiClient";
import { useAuthStore } from "../auth/authStore";

/** POST /api/catalog/import/preview — parses+matches the sheet server-side, returns a redeemable previewId. */
export function useImportPreview() {
  return useMutation({
    mutationFn: async (body: ImportPreviewRequest) => {
      const { data } = await apiClient.post<ImportPreviewResponse>("/api/catalog/import/preview", body);
      return data;
    },
  });
}

/**
 * POST /api/catalog/import/commit — redeems a previewId and upserts the
 * importable rows. Invalidates the product/category caches so Stock reflects
 * the new/updated catalog immediately.
 */
export function useImportCommit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: ImportCommitRequest) => {
      const { data } = await apiClient.post<ImportCommitResponse>("/api/catalog/import/commit", body);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

export type CatalogExportKind = "sales-ledger" | "stock-valuation";

const EXPORT_PATHS: Record<CatalogExportKind, string> = {
  "sales-ledger": "/api/catalog/export/sales-ledger",
  "stock-valuation": "/api/catalog/export/stock-valuation",
};

/**
 * Downloads one of the two export endpoints straight to a real .xlsx file in
 * app cache storage — react-native-blob-util can stream a binary response to
 * disk and attach the auth header directly to the request, which plain fetch
 * plus axios can't do for a binary download this simply — then hands it to
 * the OS share sheet (react-native-share) so the user can actually get the
 * file out to WhatsApp/email/Drive/their accountant, matching the
 * prototype's implied "take the ledger out for your accountant" use case.
 */
export async function downloadAndShareExport(kind: CatalogExportKind, opts?: { month?: string }): Promise<void> {
  const token = useAuthStore.getState().token;
  const query = kind === "sales-ledger" && opts?.month ? `?month=${encodeURIComponent(opts.month)}` : "";
  const fileName = kind === "sales-ledger" ? `sales-ledger-${opts?.month ?? "current-month"}.xlsx` : "stock-valuation.xlsx";
  const dest = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${fileName}`;

  const response = await ReactNativeBlobUtil.config({ fileCache: true, path: dest }).fetch(
    "GET",
    `${API_BASE_URL}${EXPORT_PATHS[kind]}${query}`,
    token ? { Authorization: `Bearer ${token}` } : undefined,
  );

  await Share.open({
    url: `file://${response.path()}`,
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    filename: fileName,
    failOnCancel: false,
  });
}
