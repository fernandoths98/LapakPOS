export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** User-facing names for the resources a 404 can name; unknown ones fall back to a generic line. */
const NOT_FOUND_ID: Record<string, string> = {
  Product: "Produk",
  Sale: "Transaksi",
  Outlet: "Outlet",
  Merchant: "Usaha",
  "Import preview": "Pratinjau import (silakan unggah ulang file)",
};
export const notFound = (what: string) =>
  new AppError(404, "not_found", NOT_FOUND_ID[what] ? `${NOT_FOUND_ID[what]} tidak ditemukan` : "Data tidak ditemukan");
export const badRequest = (message: string) => new AppError(400, "bad_request", message);
export const unauthorized = (message = "Sesi berakhir. Silakan masuk lagi.") => new AppError(401, "unauthorized", message);
export const forbidden = (message = "Anda tidak punya akses untuk ini.") => new AppError(403, "forbidden", message);
