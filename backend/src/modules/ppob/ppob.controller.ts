import { Request, Response } from "express";
import { z } from "zod";
import { unauthorized } from "../../utils/errors";
import * as ppobService from "./ppob.service";

export async function getBillersHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const billers = await ppobService.getBillers(req.user.merchantId);
  res.json(billers);
}

const checkBillSchema = z.object({
  billerId: z.string().uuid(),
  customerNumber: z.string().min(1),
});

export async function checkBillHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const body = checkBillSchema.parse(req.body);
  const result = await ppobService.checkBill(req.user.merchantId, body);
  res.json(result);
}

const payBillSchema = z.object({
  billerId: z.string().uuid(),
  customerNumber: z.string().min(1),
  checkRef: z.string().min(1),
});

export async function payBillHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const body = payBillSchema.parse(req.body);
  const result = await ppobService.payBill(req.user.merchantId, req.user.userId, body);
  res.json(result);
}

const transactionsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export async function getTransactionsHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const { limit } = transactionsQuerySchema.parse(req.query);
  const transactions = await ppobService.getRecentTransactions(req.user.merchantId, limit);
  res.json(transactions);
}

const commissionSummaryQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "month must be in YYYY-MM format")
    .optional(),
});

export async function getCommissionSummaryHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const { month } = commissionSummaryQuerySchema.parse(req.query);
  const summary = await ppobService.getCommissionSummary(req.user.merchantId, month);
  res.json(summary);
}
