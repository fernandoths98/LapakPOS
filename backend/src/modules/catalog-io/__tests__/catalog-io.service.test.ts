import { ImportPreviewRequest } from "@lapak/shared";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../utils/errors";
import * as catalogIoService from "../catalog-io.service";

const TEST_MERCHANT_ID = "00000000-0000-0000-0000-000000000096";
const OTHER_MERCHANT_ID = "00000000-0000-0000-0000-000000000095";
const TEST_OUTLET_ID = "00000000-0000-0000-0000-000000000296";
const OTHER_OUTLET_ID = "00000000-0000-0000-0000-000000000295";

function buildImportRequest(overrides?: Partial<ImportPreviewRequest>): ImportPreviewRequest {
  return {
    fileName: "produk-agustus.xlsx",
    headers: ["NAMA BARANG", "HRG JUAL", "HRG BELI", "QTY", "KODE"],
    rows: [
      { "NAMA BARANG": "Kopi Sachet", "HRG JUAL": "2000", "HRG BELI": "1200", QTY: "50", KODE: "8991000000001" },
      { "NAMA BARANG": "Gula Pasir 1kg", "HRG JUAL": "16000", "HRG BELI": "13500", QTY: "20", KODE: "8991000000002" },
      // price of 0 — held back
      { "NAMA BARANG": "Rokok Batangan", "HRG JUAL": "0", "HRG BELI": "1000", QTY: "100", KODE: "8991000000003" },
      // duplicate barcode with the next row — both held back
      { "NAMA BARANG": "Teh Celup A", "HRG JUAL": "9000", "HRG BELI": "6000", QTY: "10", KODE: "8991000000004" },
      { "NAMA BARANG": "Teh Celup B", "HRG JUAL": "9500", "HRG BELI": "6200", QTY: "12", KODE: "8991000000004" },
    ],
    ...overrides,
  };
}

describe("catalog-io.service", () => {
  beforeAll(async () => {
    await prisma.merchant.upsert({
      where: { id: TEST_MERCHANT_ID },
      update: {},
      create: { id: TEST_MERCHANT_ID, name: "Catalog IO Test Merchant" },
    });
    await prisma.merchant.upsert({
      where: { id: OTHER_MERCHANT_ID },
      update: {},
      create: { id: OTHER_MERCHANT_ID, name: "Catalog IO Other Merchant" },
    });
    await prisma.outlet.upsert({
      where: { id: TEST_OUTLET_ID },
      update: {},
      create: { id: TEST_OUTLET_ID, merchantId: TEST_MERCHANT_ID, name: "Catalog IO Test Outlet", code: "UTAMA", isPrimary: true },
    });
    await prisma.outlet.upsert({
      where: { id: OTHER_OUTLET_ID },
      update: {},
      create: { id: OTHER_OUTLET_ID, merchantId: OTHER_MERCHANT_ID, name: "Catalog IO Other Outlet", code: "UTAMA", isPrimary: true },
    });
    // Excel import/export needs a plan that includes it.
    for (const merchantId of [TEST_MERCHANT_ID, OTHER_MERCHANT_ID]) {
      await prisma.subscription.upsert({
        where: { merchantId },
        update: { planCode: "pro", status: "active" },
        create: { merchantId, planCode: "pro", status: "active" },
      });
    }
  });

  afterAll(async () => {
    await prisma.saleLineItem.deleteMany({ where: { product: { merchantId: { in: [TEST_MERCHANT_ID, OTHER_MERCHANT_ID] } } } });
    await prisma.sale.deleteMany({ where: { merchantId: { in: [TEST_MERCHANT_ID, OTHER_MERCHANT_ID] } } });
    await prisma.shift.deleteMany({ where: { merchantId: { in: [TEST_MERCHANT_ID, OTHER_MERCHANT_ID] } } });
    await prisma.productCostHistory.deleteMany({ where: { product: { merchantId: { in: [TEST_MERCHANT_ID, OTHER_MERCHANT_ID] } } } });
    await prisma.outletProduct.deleteMany({ where: { product: { merchantId: { in: [TEST_MERCHANT_ID, OTHER_MERCHANT_ID] } } } });
    await prisma.product.deleteMany({ where: { merchantId: { in: [TEST_MERCHANT_ID, OTHER_MERCHANT_ID] } } });
    await prisma.user.deleteMany({ where: { merchantId: { in: [TEST_MERCHANT_ID, OTHER_MERCHANT_ID] } } });
    await prisma.subscription.deleteMany({ where: { merchantId: { in: [TEST_MERCHANT_ID, OTHER_MERCHANT_ID] } } });
    await prisma.outlet.deleteMany({ where: { merchantId: { in: [TEST_MERCHANT_ID, OTHER_MERCHANT_ID] } } });
    await prisma.merchant.deleteMany({ where: { id: { in: [TEST_MERCHANT_ID, OTHER_MERCHANT_ID] } } });
    await prisma.$disconnect();
  });

  describe("previewImport", () => {
    it("maps known Indonesian/English headers to the right fields", async () => {
      const result = await catalogIoService.previewImport(TEST_MERCHANT_ID, buildImportRequest());
      expect(result.mapping).toEqual([
        { column: "NAMA BARANG", field: "name", needsReview: false },
        { column: "HRG JUAL", field: "sellPrice", needsReview: true },
        { column: "HRG BELI", field: "costPrice", needsReview: false },
        { column: "QTY", field: "stockQty", needsReview: false },
        { column: "KODE", field: "barcode", needsReview: true },
      ]);
    });

    it("flags rows with a zero price and rows with a duplicate barcode, holding both back", async () => {
      const result = await catalogIoService.previewImport(TEST_MERCHANT_ID, buildImportRequest());
      expect(result.totalRows).toBe(5);
      // 1 zero-price row + 2 duplicate-barcode rows = 3 flagged, 2 importable
      expect(result.flaggedRowCount).toBe(3);
      expect(result.importableRowCount).toBe(2);
      expect(result.flaggedReasons).toHaveLength(1);
      expect(result.flaggedReasons[0]).toMatch(/1 row has a missing, zero, or invalid price/);
      expect(result.flaggedReasons[0]).toMatch(/2 rows have a duplicate barcode/);
      expect(result.flaggedReasons[0]).toMatch(/held back for review/);
    });

    it("maps an unrecognized column to 'ignored'", async () => {
      const result = await catalogIoService.previewImport(
        TEST_MERCHANT_ID,
        buildImportRequest({
          headers: ["NAMA BARANG", "HRG JUAL", "HRG BELI", "QTY", "KODE", "SUPPLIER"],
          rows: buildImportRequest().rows.map((r) => ({ ...r, SUPPLIER: "PT Sumber Makmur" })),
        }),
      );
      expect(result.mapping.find((m) => m.column === "SUPPLIER")).toEqual({
        column: "SUPPLIER",
        field: "ignored",
        needsReview: false,
      });
    });

    it("does NOT flag a row whose barcode matches an existing product for this merchant — that's the update path", async () => {
      const existing = await prisma.product.create({
        data: {
          merchantId: TEST_MERCHANT_ID,
          name: "Existing Product",
          barcode: "8991000009999",
          sellPrice: 5000,
          costPrice: 3000,
          stockQty: 5,
        },
      });

      const result = await catalogIoService.previewImport(TEST_MERCHANT_ID, {
        fileName: "restock.xlsx",
        headers: ["NAMA BARANG", "HRG JUAL", "HRG BELI", "QTY", "KODE"],
        rows: [
          { "NAMA BARANG": "Existing Product Updated", "HRG JUAL": "5500", "HRG BELI": "3200", QTY: "9", KODE: "8991000009999" },
        ],
      });

      expect(result.flaggedRowCount).toBe(0);
      expect(result.importableRowCount).toBe(1);

      await prisma.product.delete({ where: { id: existing.id } });
    });

    it("rejects an empty sheet", async () => {
      await expect(
        catalogIoService.previewImport(TEST_MERCHANT_ID, { fileName: "empty.xlsx", headers: ["NAMA BARANG"], rows: [] }),
      ).rejects.toThrow(AppError);
    });
  });

  describe("commitImport", () => {
    it("creates new products for importable rows and skips the flagged ones", async () => {
      const preview = await catalogIoService.previewImport(TEST_MERCHANT_ID, buildImportRequest());
      const result = await catalogIoService.commitImport(TEST_MERCHANT_ID, preview.previewId);

      expect(result.createdCount).toBe(2);
      expect(result.updatedCount).toBe(0);
      expect(result.skippedCount).toBe(3);

      const kopi = await prisma.product.findFirst({ where: { merchantId: TEST_MERCHANT_ID, barcode: "8991000000001" } });
      expect(kopi?.name).toBe("Kopi Sachet");
      expect(kopi?.sellPrice).toBe(2000);

      // The zero-price and duplicate-barcode rows must never have landed.
      const notImported = await prisma.product.findFirst({ where: { merchantId: TEST_MERCHANT_ID, barcode: "8991000000003" } });
      expect(notImported).toBeNull();
    });

    it("updates an existing product by barcode match and writes cost history when cost changes", async () => {
      const existing = await prisma.product.create({
        data: {
          merchantId: TEST_MERCHANT_ID,
          name: "Kecap Manis 600ml",
          barcode: "8991000000010",
          sellPrice: 15000,
          costPrice: 10000,
          stockQty: 3,
        },
      });

      const preview = await catalogIoService.previewImport(TEST_MERCHANT_ID, {
        fileName: "update.xlsx",
        headers: ["NAMA BARANG", "HRG JUAL", "HRG BELI", "QTY", "KODE"],
        rows: [{ "NAMA BARANG": "Kecap Manis 600ml", "HRG JUAL": "16000", "HRG BELI": "11000", QTY: "25", KODE: "8991000000010" }],
      });

      const result = await catalogIoService.commitImport(TEST_MERCHANT_ID, preview.previewId);
      expect(result.createdCount).toBe(0);
      expect(result.updatedCount).toBe(1);

      const updated = await prisma.product.findUnique({ where: { id: existing.id } });
      expect(updated?.sellPrice).toBe(16000);
      expect(updated?.costPrice).toBe(11000);
      expect(updated?.stockQty).toBe(25);

      const history = await prisma.productCostHistory.findMany({ where: { productId: existing.id } });
      expect(history).toHaveLength(1);
      expect(history[0].oldCost).toBe(10000);
      expect(history[0].newCost).toBe(11000);
    });

    it("404s committing an unknown or already-committed previewId", async () => {
      await expect(catalogIoService.commitImport(TEST_MERCHANT_ID, "00000000-0000-0000-0000-000000000000")).rejects.toThrow(
        AppError,
      );
    });

    it("404s committing a previewId that belongs to a different merchant", async () => {
      const preview = await catalogIoService.previewImport(TEST_MERCHANT_ID, buildImportRequest());
      await expect(catalogIoService.commitImport(OTHER_MERCHANT_ID, preview.previewId)).rejects.toThrow(AppError);
    });

    it("deletes the preview after a successful commit so it can't be redeemed twice", async () => {
      const preview = await catalogIoService.previewImport(
        TEST_MERCHANT_ID,
        buildImportRequest({
          rows: [{ "NAMA BARANG": "One Off Product", "HRG JUAL": "3000", "HRG BELI": "2000", QTY: "5", KODE: "8991000000099" }],
        }),
      );
      await catalogIoService.commitImport(TEST_MERCHANT_ID, preview.previewId);
      await expect(catalogIoService.commitImport(TEST_MERCHANT_ID, preview.previewId)).rejects.toThrow(AppError);
    });
  });

  describe("exports", () => {
    it("builds a stock valuation workbook with one row per active product", async () => {
      await prisma.outletProduct.deleteMany({ where: { product: { merchantId: OTHER_MERCHANT_ID } } });
      await prisma.product.deleteMany({ where: { merchantId: OTHER_MERCHANT_ID } });
      for (const def of [
        { name: "Beras 5kg", sellPrice: 65000, costPrice: 58000, stockQty: 10 },
        { name: "Minyak Goreng 2L", sellPrice: 32000, costPrice: 27000, stockQty: 4 },
      ]) {
        await prisma.product.create({
          data: {
            merchantId: OTHER_MERCHANT_ID,
            ...def,
            outletProducts: { create: { outletId: OTHER_OUTLET_ID, stockQty: def.stockQty } },
          },
        });
      }

      const { workbook } = await catalogIoService.buildStockValuationWorkbook(OTHER_MERCHANT_ID);
      const sheet = workbook.getWorksheet("Stock & valuation");
      expect(sheet).toBeDefined();
      // header row + 2 data rows
      expect(sheet!.rowCount).toBe(3);

      const beras = sheet!.getRow(2);
      expect(beras.getCell(1).value).toBe("Beras 5kg");
      expect(beras.getCell(7).value).toBe(58000 * 10); // stock value
    });

    it("scopes a stock valuation workbook to one outlet's own stock and effective price", async () => {
      await prisma.outletProduct.deleteMany({ where: { product: { merchantId: OTHER_MERCHANT_ID } } });
      await prisma.product.deleteMany({ where: { merchantId: OTHER_MERCHANT_ID } });
      const second = await prisma.outlet.create({
        data: { merchantId: OTHER_MERCHANT_ID, name: "Cabang Dua", code: "DUA" },
      });
      // Carried at OTHER_OUTLET_ID (qty 10, price override 70000); absent from "DUA".
      await prisma.product.create({
        data: {
          merchantId: OTHER_MERCHANT_ID,
          name: "Beras 5kg",
          sellPrice: 65000,
          costPrice: 58000,
          stockQty: 10,
          outletProducts: { create: { outletId: OTHER_OUTLET_ID, stockQty: 10, priceOverride: 70000 } },
        },
      });

      const scoped = await catalogIoService.buildStockValuationWorkbook(OTHER_MERCHANT_ID, OTHER_OUTLET_ID);
      const scopedSheet = scoped.workbook.getWorksheet("Stock & valuation")!;
      expect(scoped.outlet?.code).toBe("UTAMA");
      expect(scopedSheet.rowCount).toBe(2); // header + Beras only
      expect(scopedSheet.getRow(2).getCell(4).value).toBe(10); // that outlet's stock
      expect(scopedSheet.getRow(2).getCell(6).value).toBe(70000); // priceOverride wins

      const emptyOutlet = await catalogIoService.buildStockValuationWorkbook(OTHER_MERCHANT_ID, second.id);
      expect(emptyOutlet.workbook.getWorksheet("Stock & valuation")!.rowCount).toBe(1); // header only

      await expect(
        catalogIoService.buildStockValuationWorkbook(OTHER_MERCHANT_ID, "00000000-0000-0000-0000-0000000009ff"),
      ).rejects.toThrow(AppError);

      await prisma.outlet.delete({ where: { id: second.id } });
    });

    it("builds a sales ledger workbook with one row per line item in the target month", async () => {
      const user = await prisma.user.create({
        data: {
          merchantId: OTHER_MERCHANT_ID,
          name: "Test Cashier",
          email: `catalog-io-test-${Date.now()}@lapak.test`,
          passwordHash: "not-a-real-hash",
          role: "owner",
        },
      });
      const shift = await prisma.shift.create({
        data: { merchantId: OTHER_MERCHANT_ID, outletId: OTHER_OUTLET_ID, userId: user.id, openingFloat: 100000 },
      });
      const product = await prisma.product.findFirstOrThrow({ where: { merchantId: OTHER_MERCHANT_ID, name: "Beras 5kg" } });

      const saleDate = new Date(Date.UTC(2026, 4, 15)); // 2026-05-15, well outside "now"
      const sale = await prisma.sale.create({
        data: {
          merchantId: OTHER_MERCHANT_ID,
          outletId: OTHER_OUTLET_ID,
          shiftId: shift.id,
          orderNo: "9001",
          clientId: `catalog-io-test-client-${Date.now()}`,
          tenderType: "cash",
          cashAmount: 65000,
          qrisAmount: 0,
          subtotal: 65000,
          total: 65000,
          createdAt: saleDate,
          lineItems: {
            create: [{ productId: product.id, productNameSnapshot: product.name, unitPriceSnapshot: 65000, qty: 1, lineTotal: 65000 }],
          },
        },
      });

      const { workbook, label } = await catalogIoService.buildSalesLedgerWorkbook(OTHER_MERCHANT_ID, "2026-05");
      expect(label).toBe("2026-05");
      const sheet = workbook.getWorksheet("Sales ledger");
      expect(sheet!.rowCount).toBe(2); // header + 1 line item
      expect(sheet!.getRow(2).getCell(2).value).toBe("Catalog IO Other Outlet"); // Outlet column
      expect(sheet!.getRow(2).getCell(3).value).toBe("9001"); // Order No, shifted right by the Outlet column

      // A different month has no rows.
      const { workbook: emptyWorkbook } = await catalogIoService.buildSalesLedgerWorkbook(OTHER_MERCHANT_ID, "2026-06");
      expect(emptyWorkbook.getWorksheet("Sales ledger")!.rowCount).toBe(1); // header only

      // Scoping to a different outlet excludes this sale.
      const other = await prisma.outlet.create({ data: { merchantId: OTHER_MERCHANT_ID, name: "Cabang Lain", code: "LAIN" } });
      const { workbook: scoped } = await catalogIoService.buildSalesLedgerWorkbook(OTHER_MERCHANT_ID, "2026-05", other.id);
      expect(scoped.getWorksheet("Sales ledger")!.rowCount).toBe(1); // header only
      await prisma.outlet.delete({ where: { id: other.id } });

      await prisma.saleLineItem.deleteMany({ where: { saleId: sale.id } });
      await prisma.sale.delete({ where: { id: sale.id } });
    });

    it("rejects an export request with a malformed month", async () => {
      await expect(catalogIoService.buildSalesLedgerWorkbook(OTHER_MERCHANT_ID, "not-a-month")).rejects.toThrow(AppError);
    });
  });
});
