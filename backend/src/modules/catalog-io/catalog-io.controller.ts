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
});

export async function exportSalesLedgerHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const { month } = exportSalesLedgerQuerySchema.parse(req.query);
  const { workbook, label } = await catalogIoService.buildSalesLedgerWorkbook(req.user.merchantId, month);

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="sales-ledger-${label}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

export async function exportStockValuationHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const workbook = await catalogIoService.buildStockValuationWorkbook(req.user.merchantId);

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="stock-valuation.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
}
