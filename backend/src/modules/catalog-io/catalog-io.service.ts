import { randomUUID } from "crypto";
import {
  ImportColumnMapping,
  ImportCommitResponse,
  ImportPreviewRequest,
  ImportPreviewResponse,
  parseRupiah,
} from "@lapak/shared";
import { Workbook } from "exceljs";
import { prisma } from "../../db/prisma";
import { assertWithinQuota, requireFeature } from "../subscription/entitlements.service";
import { badRequest, notFound } from "../../utils/errors";
import { recordCostChangeIfNeeded } from "../products/products.service";
import { DEFAULT_TIMEZONE, localDateKey, monthBoundsForKey } from "../../utils/time";

// ── Column matching ─────────────────────────────────────────────────────

type MappedField = "name" | "sellPrice" | "costPrice" | "stockQty" | "barcode" | "category" | "ignored";
type KnownField = Exclude<MappedField, "ignored">;

/**
 * Indonesian/English header aliases the prototype's mock mapping panel
 * demonstrates (NAMA BARANG → Name, HRG JUAL → Sell price, etc). A plain
 * normalized-exact-alias lookup — no fuzzy matching library — matches what
 * the prototype shows and is enough for the real warungs' spreadsheet habits.
 * `category` is optional: a row with one is filed under it (the category is
 * created if it doesn't exist yet), which is what keeps freshly-imported
 * products from vanishing behind the Sell screen's category pills.
 */
const FIELD_ALIASES: Record<KnownField, string[]> = {
  name: ["NAMA BARANG", "NAMA", "NAME", "PRODUK", "PRODUCT"],
  sellPrice: ["HRG JUAL", "HARGA JUAL", "HARGA", "PRICE", "SELL PRICE"],
  costPrice: ["HRG BELI", "HARGA BELI", "COST", "MODAL", "HPP"],
  stockQty: ["QTY", "STOK", "STOCK", "JUMLAH"],
  barcode: ["KODE", "BARCODE", "KODE BARANG", "KODE BATANG"],
  category: ["KATEGORI", "CATEGORY", "KAT", "JENIS", "GOLONGAN"],
};

const KNOWN_FIELDS = Object.keys(FIELD_ALIASES) as KnownField[];

function normalizeHeader(header: string): string {
  return header.trim().toUpperCase().replace(/\s+/g, " ");
}

function matchColumnField(header: string): MappedField {
  const normalized = normalizeHeader(header);
  for (const field of KNOWN_FIELDS) {
    if (FIELD_ALIASES[field].includes(normalized)) return field;
  }
  return "ignored";
}

// ── Preview store ────────────────────────────────────────────────────────

interface StoredPreviewRow {
  name: string | null;
  sellPrice: number | null;
  costPrice: number | null;
  stockQty: number | null;
  barcode: string | null;
  category: string | null;
  flagged: boolean;
}

interface StoredPreview {
  merchantId: string;
  expiresAt: number;
  rows: StoredPreviewRow[];
}

/**
 * In-process preview store, not a Postgres table: a deliberate simplification
 * appropriate for a single-instance deployment. It is lost on server restart
 * and does not survive horizontal scaling — a real multi-instance deployment
 * would need this in Redis (or Postgres with a TTL sweep) instead. Entries
 * are evicted after PREVIEW_TTL_MS, checked lazily on every access plus a
 * background sweep so an abandoned preview doesn't leak memory forever.
 */
const previews = new Map<string, StoredPreview>();
const PREVIEW_TTL_MS = 30 * 60 * 1000;

function sweepExpiredPreviews(): void {
  const now = Date.now();
  for (const [id, preview] of previews) {
    if (preview.expiresAt <= now) previews.delete(id);
  }
}

// unref() so this background sweep never keeps the process (or a jest run) alive.
setInterval(sweepExpiredPreviews, 5 * 60 * 1000).unref();

// ── Preview ──────────────────────────────────────────────────────────────

/**
 * A row is flagged (held back from commit) when its mapped sell price is
 * missing, non-numeric, or zero, or when its mapped barcode is used by
 * another row in the SAME sheet. Matching an existing product's barcode is
 * NOT a flag condition — that is the designed upsert path (see
 * `commitImport`): a row whose barcode already belongs to a product for this
 * merchant updates that product rather than being held back.
 */
export async function previewImport(merchantId: string, body: ImportPreviewRequest): Promise<ImportPreviewResponse> {
  await requireFeature(merchantId, "excelIO");
  sweepExpiredPreviews();

  if (body.headers.length === 0) {
    throw badRequest("The sheet has no columns");
  }
  if (body.rows.length === 0) {
    throw badRequest("The sheet has no data rows");
  }

  // First column that matches a given field wins if two columns map to it.
  const fieldColumn = new Map<KnownField, string>();
  const mapping: ImportColumnMapping[] = body.headers.map((header) => {
    const field = matchColumnField(header);
    if (field !== "ignored" && !fieldColumn.has(field)) {
      fieldColumn.set(field, header);
    }
    return { column: header, field, needsReview: false };
  });

  const readField = (row: Record<string, string>, field: KnownField): string | undefined => {
    const column = fieldColumn.get(field);
    return column !== undefined ? row[column] : undefined;
  };

  // Count barcode occurrences across the sheet first, so a row can tell
  // whether ITS barcode is one of the duplicated ones.
  const barcodeOccurrences = new Map<string, number>();
  for (const raw of body.rows) {
    const barcode = readField(raw, "barcode")?.trim();
    if (!barcode) continue;
    barcodeOccurrences.set(barcode, (barcodeOccurrences.get(barcode) ?? 0) + 1);
  }

  let priceFlagCount = 0;
  let duplicateBarcodeFlagCount = 0;

  const rows: StoredPreviewRow[] = body.rows.map((raw) => {
    const nameRaw = readField(raw, "name")?.trim();
    const sellPriceRaw = readField(raw, "sellPrice");
    const costPriceRaw = readField(raw, "costPrice");
    const stockQtyRaw = readField(raw, "stockQty");
    const barcodeRaw = readField(raw, "barcode")?.trim();
    const categoryRaw = readField(raw, "category")?.trim();

    const name = nameRaw || null;
    // parseRupiah("") and parseRupiah("abc") both settle to 0, which is
    // exactly right here: missing, non-numeric, and zero all read the same
    // way for the "held back for review" rule.
    const sellPrice = sellPriceRaw !== undefined ? parseRupiah(sellPriceRaw) : 0;
    const costPrice = costPriceRaw !== undefined ? parseRupiah(costPriceRaw) : 0;
    const stockQty = stockQtyRaw !== undefined ? parseRupiah(stockQtyRaw) : 0;
    const barcode = barcodeRaw || null;

    const priceIssue = sellPrice <= 0;
    const duplicateBarcode = !!barcode && (barcodeOccurrences.get(barcode) ?? 0) > 1;

    if (priceIssue) priceFlagCount++;
    if (duplicateBarcode) duplicateBarcodeFlagCount++;

    return {
      name,
      sellPrice,
      costPrice,
      stockQty,
      barcode,
      category: categoryRaw ? categoryRaw.slice(0, 40) : null,
      flagged: priceIssue || duplicateBarcode,
    };
  });

  // Columns mapped to a flagged field get highlighted ("needs review") in
  // the mobile mapping panel, mirroring the prototype's accent-colored
  // "Barcode — confirm?" row.
  for (const m of mapping) {
    if (m.field === "sellPrice" && priceFlagCount > 0) m.needsReview = true;
    if (m.field === "barcode" && duplicateBarcodeFlagCount > 0) m.needsReview = true;
  }

  const flaggedRowCount = rows.filter((r) => r.flagged).length;
  const importableRowCount = rows.length - flaggedRowCount;

  const previewId = randomUUID();
  previews.set(previewId, {
    merchantId,
    expiresAt: Date.now() + PREVIEW_TTL_MS,
    rows,
  });

  return {
    previewId,
    totalRows: rows.length,
    mapping,
    flaggedRowCount,
    flaggedReasons: buildFlaggedReasons(priceFlagCount, duplicateBarcodeFlagCount),
    importableRowCount,
  };
}

function buildFlaggedReasons(priceFlagCount: number, duplicateBarcodeFlagCount: number): string[] {
  if (priceFlagCount === 0 && duplicateBarcodeFlagCount === 0) return [];

  const parts: string[] = [];
  if (priceFlagCount > 0) {
    parts.push(`${priceFlagCount} baris harganya kosong, nol, atau bukan angka`);
  }
  if (duplicateBarcodeFlagCount > 0) {
    parts.push(`${duplicateBarcodeFlagCount} baris punya KODE yang sama`);
  }

  const joined = parts.length === 2 ? `${parts[0]} dan ${parts[1]}` : parts[0];
  return [`${joined} — baris itu ditahan dulu untuk dicek.`];
}

// ── Commit ───────────────────────────────────────────────────────────────

/**
 * Upserts the importable (non-flagged) rows from a previously-computed
 * preview, in a single transaction. A row whose barcode already belongs to a
 * product for this merchant (soft-deleted or not) updates that product —
 * reviving it if it was soft-deleted, since re-importing a catalog that
 * includes a previously-removed barcode is a clear signal the merchant wants
 * it active again — and writes cost history the same way a manual edit does.
 * A row with no barcode, or one that matches nothing, creates a new product.
 * A `KATEGORI` cell files the product under that category, creating it if it
 * doesn't exist yet. Deletes the preview from the in-memory store once
 * committed.
 */
export async function commitImport(merchantId: string, previewId: string): Promise<ImportCommitResponse> {
  await requireFeature(merchantId, "excelIO");
  sweepExpiredPreviews();

  const preview = previews.get(previewId);
  if (!preview || preview.merchantId !== merchantId) {
    throw notFound("Import preview");
  }

  const importableRows = preview.rows.filter((r) => !r.flagged);
  const skippedCount = preview.rows.length - importableRows.length;

  // Rows without a matching existing barcode become new products — count
  // those against the plan's product cap (conservative: treats an unknown
  // barcode as a create).
  const knownBarcodes = new Set(
    (
      await prisma.product.findMany({
        where: { merchantId, barcode: { in: importableRows.map((r) => r.barcode).filter((b): b is string => !!b) } },
        select: { barcode: true },
      })
    ).map((p) => p.barcode),
  );
  const newRowCount = importableRows.filter((r) => !r.barcode || !knownBarcodes.has(r.barcode)).length;
  if (newRowCount > 0) await assertWithinQuota(merchantId, "products", newRowCount);

  let createdCount = 0;
  let updatedCount = 0;

  await prisma.$transaction(async (tx) => {
    // Phase 1 dual-write target: imported products need a per-outlet inventory
    // row too. Entered stock lands on the primary outlet (index 0).
    const outlets = await tx.outlet.findMany({
      where: { merchantId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: { id: true },
    });

    // Resolve a KATEGORI cell to a category id, creating (or reviving) the
    // category on first sight. Keyed case-insensitively so "Rokok" and
    // "rokok" file together, matching the `@@unique([merchantId, name])`
    // dedupe rule.
    const categoryIdByName = new Map<string, string>(
      (await tx.category.findMany({ where: { merchantId }, select: { id: true, name: true } })).map((c) => [
        c.name.trim().toLowerCase(),
        c.id,
      ]),
    );
    const resolveCategoryId = async (rawName: string): Promise<string> => {
      const key = rawName.trim().toLowerCase();
      const cached = categoryIdByName.get(key);
      if (cached) return cached;
      const category = await tx.category.upsert({
        where: { merchantId_name: { merchantId, name: rawName.trim() } },
        update: {},
        create: { merchantId, name: rawName.trim() },
        select: { id: true },
      });
      categoryIdByName.set(key, category.id);
      return category.id;
    };

    for (const row of importableRows) {
      const name = row.name ?? "Imported product";
      const sellPrice = row.sellPrice ?? 0;
      const costPrice = row.costPrice ?? 0;
      const stockQty = row.stockQty ?? 0;
      const barcode = row.barcode;
      const categoryId = row.category ? await resolveCategoryId(row.category) : null;

      // Matched without a deletedAt filter, mirroring products.service's own
      // barcode-availability check — the schema's unique index on
      // (merchantId, barcode) doesn't care about deletedAt either.
      const existing = barcode ? await tx.product.findFirst({ where: { merchantId, barcode } }) : null;

      if (existing) {
        await tx.product.update({
          where: { id: existing.id },
          // Only overwrite the category when the sheet actually named one —
          // an import that omits KATEGORI shouldn't wipe a product's existing
          // category.
          data: { name, sellPrice, costPrice, stockQty, deletedAt: null, ...(categoryId ? { categoryId } : {}) },
        });
        await recordCostChangeIfNeeded(tx, existing.id, existing.costPrice, costPrice);
        if (outlets[0]) {
          await tx.outletProduct.upsert({
            where: { outletId_productId: { outletId: outlets[0].id, productId: existing.id } },
            update: { stockQty },
            create: { outletId: outlets[0].id, productId: existing.id, stockQty },
          });
        }
        updatedCount++;
      } else {
        const created = await tx.product.create({
          data: { merchantId, categoryId, name, barcode, sellPrice, costPrice, stockQty, lowStockThreshold: 8 },
        });
        if (outlets.length > 0) {
          await tx.outletProduct.createMany({
            data: outlets.map((outlet, index) => ({
              outletId: outlet.id,
              productId: created.id,
              stockQty: index === 0 ? stockQty : 0,
            })),
          });
        }
        createdCount++;
      }
    }
  });

  previews.delete(previewId);

  return { createdCount, updatedCount, skippedCount };
}

// ── Exports ──────────────────────────────────────────────────────────────

interface ExportOutlet {
  id: string;
  code: string;
  name: string;
  timezone: string;
}

/**
 * Validates an optional `outletId` against the merchant and returns the outlet
 * to scope an export to (404 if it isn't the merchant's), plus the timezone
 * accounting months should be bucketed in — the outlet's own, or the
 * merchant's primary outlet's for a consolidated (all-outlets) export.
 */
async function resolveExportScope(
  merchantId: string,
  outletId?: string,
): Promise<{ outlet: ExportOutlet | null; timeZone: string }> {
  if (outletId) {
    const outlet = await prisma.outlet.findFirst({
      where: { id: outletId, merchantId },
      select: { id: true, code: true, name: true, timezone: true },
    });
    if (!outlet) throw notFound("Outlet");
    return { outlet, timeZone: outlet.timezone };
  }
  const primary = await prisma.outlet.findFirst({
    where: { merchantId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: { timezone: true },
  });
  return { outlet: null, timeZone: primary?.timezone ?? DEFAULT_TIMEZONE };
}

function resolveMonthRange(month: string | undefined, timeZone: string): { start: Date; end: Date; label: string } {
  let label: string;
  if (month) {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw badRequest("month must be in YYYY-MM format");
    }
    label = month;
  } else {
    label = localDateKey(new Date(), timeZone).slice(0, 7); // current month in the export's timezone
  }
  const { start, end } = monthBoundsForKey(label, timeZone);
  return { start, end, label };
}

/**
 * One row per sale line item within the given month (current month if
 * omitted), only completed sales. `outletId` scopes it to one outlet; without
 * it every outlet is included and the `Outlet` column tells them apart. The
 * month window and each row's `Date` are in the relevant outlet's timezone.
 */
export async function buildSalesLedgerWorkbook(
  merchantId: string,
  month?: string,
  outletId?: string,
): Promise<{ workbook: Workbook; label: string; outlet: ExportOutlet | null }> {
  await requireFeature(merchantId, "excelIO");
  const { outlet, timeZone } = await resolveExportScope(merchantId, outletId);
  const { start, end, label } = resolveMonthRange(month, timeZone);

  const lineItems = await prisma.saleLineItem.findMany({
    where: {
      sale: {
        merchantId,
        status: "completed",
        createdAt: { gte: start, lt: end },
        ...(outlet ? { outletId: outlet.id } : {}),
      },
    },
    include: { sale: { include: { outlet: { select: { name: true, timezone: true } } } } },
    orderBy: [{ sale: { createdAt: "asc" } }],
  });

  const workbook = new Workbook();
  const sheet = workbook.addWorksheet("Sales ledger");
  sheet.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Outlet", key: "outlet", width: 24 },
    { header: "Order No", key: "orderNo", width: 12 },
    { header: "Product", key: "product", width: 32 },
    { header: "Qty", key: "qty", width: 8 },
    { header: "Unit Price", key: "unitPrice", width: 14 },
    { header: "Line Total", key: "lineTotal", width: 14 },
    { header: "Tender", key: "tender", width: 10 },
  ];

  for (const li of lineItems) {
    sheet.addRow({
      date: localDateKey(li.sale.createdAt, li.sale.outlet.timezone),
      outlet: li.sale.outlet.name,
      orderNo: li.sale.orderNo,
      product: li.productNameSnapshot,
      qty: li.qty,
      unitPrice: li.unitPriceSnapshot,
      lineTotal: li.lineTotal,
      tender: li.sale.tenderType,
    });
  }

  return { workbook, label, outlet };
}

/**
 * One row per active (non-deleted) product: cost, sell price, stock value and
 * potential margin. Without `outletId`, `Stock Qty` is the total across every
 * outlet that carries the product and `Sell Price` is the catalog price. With
 * `outletId`, only products that outlet carries are listed, `Stock Qty` is
 * that outlet's stock, and `Sell Price` is its effective price
 * (`priceOverride ?? sellPrice`).
 */
export async function buildStockValuationWorkbook(
  merchantId: string,
  outletId?: string,
): Promise<{ workbook: Workbook; outlet: ExportOutlet | null }> {
  await requireFeature(merchantId, "excelIO");
  const { outlet } = await resolveExportScope(merchantId, outletId);

  const products = await prisma.product.findMany({
    where: {
      merchantId,
      deletedAt: null,
      ...(outlet ? { outletProducts: { some: { outletId: outlet.id, deletedAt: null } } } : {}),
    },
    include: {
      category: true,
      outletProducts: {
        where: { deletedAt: null, ...(outlet ? { outletId: outlet.id } : {}) },
        select: { stockQty: true, priceOverride: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const workbook = new Workbook();
  const sheet = workbook.addWorksheet("Stock & valuation");
  sheet.columns = [
    { header: "Name", key: "name", width: 32 },
    { header: "Barcode", key: "barcode", width: 16 },
    { header: "Category", key: "category", width: 16 },
    { header: "Stock Qty", key: "stockQty", width: 10 },
    { header: "Cost Price", key: "costPrice", width: 12 },
    { header: "Sell Price", key: "sellPrice", width: 12 },
    { header: "Stock Value", key: "stockValue", width: 14 },
    { header: "Potential Margin", key: "potentialMargin", width: 16 },
  ];

  for (const p of products) {
    const stockQty = p.outletProducts.reduce((sum, op) => sum + op.stockQty, 0);
    const sellPrice = outlet ? p.outletProducts[0]?.priceOverride ?? p.sellPrice : p.sellPrice;
    sheet.addRow({
      name: p.name,
      barcode: p.barcode ?? "",
      category: p.category?.name ?? "",
      stockQty,
      costPrice: p.costPrice,
      sellPrice,
      stockValue: p.costPrice * stockQty,
      potentialMargin: (sellPrice - p.costPrice) * stockQty,
    });
  }

  return { workbook, outlet };
}

/**
 * The blank import template: the exact header row the alias matcher expects,
 * a few filled-in example rows a warung owner can copy, and a second sheet
 * spelling out the rules in Bahasa Indonesia. Handed to the owner from the
 * Excel screen so nobody has to guess the column names.
 */
export function buildImportTemplateWorkbook(): Workbook {
  const workbook = new Workbook();

  const sheet = workbook.addWorksheet("Produk");
  sheet.columns = [
    { header: "NAMA BARANG", key: "name", width: 32 },
    { header: "HRG JUAL", key: "sellPrice", width: 12 },
    { header: "HRG BELI", key: "costPrice", width: 12 },
    { header: "QTY", key: "stockQty", width: 8 },
    { header: "KODE", key: "barcode", width: 18 },
    { header: "KATEGORI", key: "category", width: 16 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRow({ name: "Indomie Goreng", sellPrice: 3500, costPrice: 2800, stockQty: 40, barcode: "8992388101010", category: "Makanan" });
  sheet.addRow({ name: "Teh Botol 350ml", sellPrice: 4000, costPrice: 3000, stockQty: 24, barcode: "8993675123456", category: "Minuman" });
  sheet.addRow({ name: "Beras 5kg", sellPrice: 68000, costPrice: 61000, stockQty: 10, barcode: "", category: "Sembako" });

  const guide = workbook.addWorksheet("Petunjuk");
  guide.columns = [{ header: "Cara mengisi", key: "line", width: 90 }];
  guide.getRow(1).font = { bold: true };
  [
    "1. Jangan ubah baris judul (NAMA BARANG, HRG JUAL, dst). Nama kolom boleh huruf besar/kecil.",
    "2. Satu baris = satu produk. Hapus contoh di sheet 'Produk' lalu isi produkmu sendiri.",
    "3. NAMA BARANG dan HRG JUAL wajib diisi. Harga harus angka lebih dari 0 — baris tanpa harga ditahan.",
    "4. HRG BELI dan QTY boleh dikosongkan (dianggap 0).",
    "5. KODE (barcode) opsional. Kalau diisi, harus unik di file ini. KODE yang sudah ada di katalog = produk itu diperbarui, bukan dobel.",
    "6. KATEGORI opsional. Kategori yang belum ada akan dibuat otomatis. Isi kategori supaya produk langsung muncul di pill kategori layar Kasir.",
    "7. Simpan sebagai .xlsx, lalu pilih file ini di layar Excel aplikasi. Kamu bisa cek pencocokan kolom sebelum menyimpan.",
    "8. Angka boleh pakai titik ribuan (mis. 68.000) — tetap terbaca.",
  ].forEach((line) => guide.addRow({ line }));

  return workbook;
}
