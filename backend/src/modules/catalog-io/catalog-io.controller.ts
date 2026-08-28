import { Request, Response } from "express";
import { z } from "zod";
import { unauthorized } from "../../utils/errors";
import * as catalogIoService from "./catalog-io.service";

const previewImportSchema = z.object({
  fileName: z.string().min(1),
  headers: z.array(z.string()).min(1),
  rows: z.array(z.record(z.string())).min(1),
});

export async function previewImportHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const body = previewImportSchema.parse(req.body);
  const result = await catalogIoService.previewImport(req.user.merchantId, body);
  res.json(result);
}

const commitImportSchema = z.object({
  previewId: z.string().min(1),
});

export async function commitImportHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const { previewId } = commitImportSchema.parse(req.body);
  const result = await catalogIoService.commitImport(req.user.merchantId, previewId);
  res.json(result);
}

const exportSalesLedgerQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "month must be in YYYY-MM format")
    .optional(),
  outletId: z.string().uuid().optional(),
});

export async function exportSalesLedgerHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const { month, outletId } = exportSalesLedgerQuerySchema.parse(req.query);
  const { workbook, label, outlet } = await catalogIoService.buildSalesLedgerWorkbook(req.user.merchantId, month, outletId);

  const suffix = outlet ? `-${outlet.code}` : "";
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="sales-ledger-${label}${suffix}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

export async function exportImportTemplateHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const workbook = catalogIoService.buildImportTemplateWorkbook();

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="template-import-produk.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
}

const exportStockValuationQuerySchema = z.object({ outletId: z.string().uuid().optional() });

export async function exportStockValuationHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const { outletId } = exportStockValuationQuerySchema.parse(req.query);
  const { workbook, outlet } = await catalogIoService.buildStockValuationWorkbook(req.user.merchantId, outletId);

  const suffix = outlet ? `-${outlet.code}` : "";
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="stock-valuation${suffix}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}
