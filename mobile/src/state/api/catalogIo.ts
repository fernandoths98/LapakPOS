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

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

class HttpDownloadError extends Error {}

/**
 * Fetches a small .xlsx into memory and writes it to app cache, returning the
 * path.
 *
 * Deliberately NOT `ReactNativeBlobUtil.config({ fileCache, path }).fetch()`:
 * that streaming-to-disk writer throws "Download interrupted" on Android for
 * chunked / HTTP-2 responses, which is exactly how the backend sends these
 * (`workbook.xlsx.write(res)` streams). The files are a few KB–a few hundred
 * KB so buffering in memory is fine, and one retry rides out a transient
 * socket drop. `.fetch` also resolves on a 4xx/5xx (body in memory, no
 * throw), so the status is turned into a readable message here rather than
 * surfacing later as an opaque "share failed" on a renamed JSON error.
 */
async function downloadXlsxToCache(url: string, fileName: string, what: string): Promise<string> {
  const token = useAuthStore.getState().token;
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const dest = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${fileName}`;

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ReactNativeBlobUtil.fetch("GET", url, headers);
      const status = response.info().status;
      if (status < 200 || status >= 300) {
        let detail = "";
        try {
          const body = String(response.text());
          detail = (JSON.parse(body)?.message as string) || body.slice(0, 200);
        } catch {
          detail = "";
        }
        if (status === 401) throw new HttpDownloadError("Sesi berakhir. Masuk ulang lalu coba lagi.");
        if (status === 402) throw new HttpDownloadError(`${what} butuh paket berbayar. ${detail}`.trim());
        throw new HttpDownloadError(`${what} gagal diunduh (HTTP ${status}). ${detail}`.trim());
      }
      await ReactNativeBlobUtil.fs.writeFile(dest, response.base64(), "base64");
      return dest;
    } catch (err) {
      lastError = err;
      if (err instanceof HttpDownloadError) throw err; // a real server answer — retrying won't help
    }
  }
  throw lastError instanceof Error
    ? new Error(`${what} gagal diunduh: ${lastError.message}`)
    : new Error(`${what} gagal diunduh. Periksa koneksi lalu coba lagi.`);
}

/** Hands a downloaded .xlsx on disk to the OS share sheet, normalising the file:// prefix. */
async function shareXlsx(path: string, fileName: string): Promise<void> {
  const url = path.startsWith("file://") ? path : `file://${path}`;
  try {
    await Share.open({ url, type: XLSX_MIME, filename: fileName, failOnCancel: false });
  } catch (err) {
    // Backing out of the OS share sheet still rejects on some react-native-share
    // builds even with failOnCancel:false — that is not a download failure.
    const message = err instanceof Error ? err.message : String(err);
    if (/cancel|dismiss|did not share/i.test(message)) return;
    throw err;
  }
}

/**
 * Downloads the blank import template (`GET /api/catalog/import/template`) to
 * app cache and hands it to the OS share sheet — same streaming-to-disk +
 * share flow as the exports, so the owner can open it in Excel / Google
 * Sheets / WhatsApp it to whoever keeps their spreadsheet.
 */
export async function downloadImportTemplate(): Promise<void> {
  const fileName = "template-import-produk.xlsx";
  const path = await downloadXlsxToCache(`${API_BASE_URL}/api/catalog/import/template`, fileName, "Template");
  await shareXlsx(path, fileName);
}

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
  const query = kind === "sales-ledger" && opts?.month ? `?month=${encodeURIComponent(opts.month)}` : "";
  const fileName = kind === "sales-ledger" ? `sales-ledger-${opts?.month ?? "current-month"}.xlsx` : "stock-valuation.xlsx";
  const what = kind === "sales-ledger" ? "Buku penjualan" : "Nilai stok";
  const path = await downloadXlsxToCache(`${API_BASE_URL}${EXPORT_PATHS[kind]}${query}`, fileName, what);
  await shareXlsx(path, fileName);
}
