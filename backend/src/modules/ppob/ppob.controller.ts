import { Request, Response } from "express";
import { z } from "zod";
import { unauthorized } from "../../utils/errors";
import * as ppobService from "./ppob.service";
import { applyDigiflazzWebhook, verifyDigiflazzSignature } from "./digiflazzWebhook.service";
import { env } from "../../config/env";

export async function getBillersHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const billers = await ppobService.getBillers(req.user.merchantId);
  res.json(billers);
}

const checkBillSchema = z.object({
  billerId: z.string().uuid(),
  customerNumber: z.string().min(1),
  skuCode: z.string().min(1).optional(),
});

export async function getPrepaidProductsHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const { category } = z.object({ category: z.enum(["mobile", "ewallet", "electricity", "games", "tv_voucher", "gas"]) }).parse(req.query);
  res.json(await ppobService.getPrepaidProducts(category));
}

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

export async function digiflazzWebhookHandler(req: Request, res: Response): Promise<void> {
  const signature = req.header("x-hub-signature") ?? undefined;
  if (!req.rawBody || !verifyDigiflazzSignature(req.rawBody, signature)) {
    res.status(401).json({ message: "Invalid webhook signature" });
    return;
  }
  const result = await applyDigiflazzWebhook(req.body?.data ?? {});
  res.json({ ok: true, result });
}

export async function getProviderStatusHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const digiflazz = env.PPOB_PROVIDER === "digiflazz";
  const key = env.DIGIFLAZZ_MODE === "production" ? env.DIGIFLAZZ_PRODUCTION_KEY : env.DIGIFLAZZ_DEVELOPMENT_KEY;
  res.json({
    provider: digiflazz ? "digiflazz" : "mock",
    mode: digiflazz ? env.DIGIFLAZZ_MODE : "mock",
    configured: digiflazz ? Boolean(env.DIGIFLAZZ_USERNAME && key) : true,
  });
}
