import { PLAN_CODES } from "@lapak/shared";
import { Request, Response } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { unauthorized } from "../../utils/errors";
import { getEntitlements } from "./entitlements.service";
import * as subscriptionService from "./subscription.service";

export async function getEntitlementsHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  res.json(await getEntitlements(req.user.merchantId));
}

export async function getSubscriptionHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  res.json(await subscriptionService.getSubscription(req.user.merchantId));
}

export async function getPlansHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  res.json(await subscriptionService.getPlans(req.user.merchantId));
}

export async function getInvoicesHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(req.query);
  res.json(await subscriptionService.getInvoices(req.user.merchantId, limit));
}

const checkoutSchema = z.object({
  planCode: z.enum(PLAN_CODES).refine((c) => c !== "free", "Pilih paket berbayar"),
  months: z.number().int().min(1).max(12).optional(),
});

export async function checkoutHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const body = checkoutSchema.parse(req.body);
  res.status(201).json(
    await subscriptionService.createCheckout(req.user.merchantId, {
      planCode: body.planCode as Exclude<(typeof PLAN_CODES)[number], "free">,
      months: body.months,
    }),
  );
}

export async function nusapayWebhookHandler(req: Request, res: Response): Promise<void> {
  if (!env.NUSAPAY_WEBHOOK_SECRET || req.header("x-lapak-gateway-key") !== env.NUSAPAY_WEBHOOK_SECRET) {
    throw unauthorized("Invalid NusaPay webhook key");
  }
  const body = z
    .object({
      partnerReferenceNo: z.string(),
      amount: z.union([z.number(), z.string()]),
      providerReferenceNo: z.string().optional(),
      paidAt: z.string().optional(),
    })
    .parse(req.body);
  const amount = Math.trunc(
    Number(typeof body.amount === "string" ? body.amount.replace(/[^\d.]/g, "") : body.amount),
  );
  res.json({
    success: true,
    result: await subscriptionService.applySubscriptionPayment({
      partnerRef: body.partnerReferenceNo,
      amount,
      providerRef: body.providerReferenceNo,
      paidAt: body.paidAt,
    }),
  });
}
