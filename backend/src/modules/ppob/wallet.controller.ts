import { Request, Response } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { unauthorized } from "../../utils/errors";
import * as wallet from "./wallet.service";

const limitSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) });

export async function walletSummaryHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  res.json(await wallet.getWalletSummary(req.user.merchantId));
}
export async function walletLedgerHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const { limit } = limitSchema.parse(req.query);
  res.json(await wallet.getWalletLedger(req.user.merchantId, limit));
}
export async function walletTopupsHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const { limit } = limitSchema.parse(req.query);
  res.json(await wallet.getTopups(req.user.merchantId, limit));
}
export async function createWalletTopupHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const { amount } = z.object({ amount: z.number().int() }).parse(req.body);
  res.status(201).json(await wallet.createTopup(req.user.merchantId, amount));
}
export async function nusapayWebhookHandler(req: Request, res: Response): Promise<void> {
  if (!env.NUSAPAY_WEBHOOK_SECRET || req.header("x-lapak-gateway-key") !== env.NUSAPAY_WEBHOOK_SECRET) throw unauthorized("Invalid NusaPay webhook key");
  const body = z.object({ partnerReferenceNo: z.string(), amount: z.union([z.number(), z.string()]), providerReferenceNo: z.string().optional(), paidAt: z.string().optional() }).parse(req.body);
  const amount = Math.trunc(Number(typeof body.amount === "string" ? body.amount.replace(/[^\d.]/g, "") : body.amount));
  res.json({ success: true, result: await wallet.applyNusapayPayment({ partnerRef: body.partnerReferenceNo, amount, providerRef: body.providerReferenceNo, paidAt: body.paidAt }) });
}
