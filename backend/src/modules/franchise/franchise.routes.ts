import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import { unauthorized } from "../../utils/errors";
import * as franchise from "./franchise.service";

export const franchiseRouter = Router();

const ownerOnly = [requireAuth, requireRole("owner")] as const;

franchiseRouter.get(
  "/agreements",
  ...ownerOnly,
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();
    res.json(await franchise.listAgreements(req.user.merchantId));
  }),
);

const upsertSchema = z.object({
  outletId: z.string().uuid(),
  royaltyPercent: z.number().int().min(0).max(100),
  feeMonthly: z.number().int().min(0),
  allowPriceOverride: z.boolean().optional(),
  startDate: z.string().optional(),
  notes: z.string().nullable().optional(),
});

franchiseRouter.post(
  "/agreements",
  ...ownerOnly,
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();
    res.status(201).json(await franchise.upsertAgreement(req.user.merchantId, upsertSchema.parse(req.body)));
  }),
);

franchiseRouter.post(
  "/agreements/:id/end",
  ...ownerOnly,
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();
    res.json(await franchise.endAgreement(req.user.merchantId, req.params.id));
  }),
);

franchiseRouter.get(
  "/statements",
  ...ownerOnly,
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }).parse(req.query);
    res.json(await franchise.listStatements(req.user.merchantId, limit));
  }),
);

franchiseRouter.post(
  "/statements/generate",
  ...ownerOnly,
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();
    const body = z.object({ periodStart: z.string().optional(), periodEnd: z.string().optional() }).parse(req.body ?? {});
    res.json(await franchise.generateStatements(req.user.merchantId, body));
  }),
);

franchiseRouter.patch(
  "/statements/:id",
  ...ownerOnly,
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();
    const { status } = z.object({ status: z.enum(["issued", "paid"]) }).parse(req.body);
    res.json(await franchise.setStatementStatus(req.user.merchantId, req.params.id, status));
  }),
);
