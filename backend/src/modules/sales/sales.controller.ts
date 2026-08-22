import { TENDER_TYPES } from "@lapak/shared";
import { Request, Response } from "express";
import { z } from "zod";
import { unauthorized } from "../../utils/errors";
import * as salesService from "./sales.service";

const createSaleLineItemSchema = z.object({
  productId: z.string().uuid(),
  qty: z.number().int().positive(),
});

const createSaleSchema = z.object({
  clientId: z.string().uuid(),
  lineItems: z.array(createSaleLineItemSchema).min(1),
  tenderType: z.enum(TENDER_TYPES),
  cashAmount: z.number().int().nonnegative(),
  qrisAmount: z.number().int().nonnegative(),
  discount: z.number().int().nonnegative().optional(),
  createdOffline: z.boolean().optional(),
});

export async function createSaleHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const body = createSaleSchema.parse(req.body);
  const sale = await salesService.createSale(req.user.merchantId, req.user.userId, body);
  res.json(sale);
}

export async function getSaleHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const sale = await salesService.getSaleById(req.user.merchantId, req.params.id);
  res.json(sale);
}

export async function getSalesHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(req.query);
  res.json(await salesService.getRecentSales(req.user.merchantId, query.limit));
}

export async function getTodaySummaryHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const summary = await salesService.getTodaySummary(req.user.merchantId);
  res.json(summary);
}
