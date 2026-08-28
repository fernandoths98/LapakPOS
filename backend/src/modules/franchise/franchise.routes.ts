import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import { unauthorized } from "../../utils/errors";
import * as franchise from "./franchise.service";
import * as partners from "./partners.service";

export const franchiseRouter = Router();

const ownerOnly = [requireAuth, requireRole("owner")] as const;

// ── Inter-tenant franchise partners ────────────────────────────────────

franchiseRouter.get(
  "/partners",
  ...ownerOnly,
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();
    res.json(await partners.listPartners(req.user.merchantId));
  }),
);

franchiseRouter.post(
  "/partners/invite",
  ...ownerOnly,
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();
    const body = z
      .object({ label: z.string().optional(), royaltyPercent: z.number().int().min(0).max(100), feeMonthly: z.number().int().min(0) })
      .parse(req.body);
    res.status(201).json(await partners.createPartnerInvite(req.user.merchantId, body));
  }),
);

franchiseRouter.post(
  "/partners/:id/end",
  ...ownerOnly,
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();
    res.json(await partners.endPartner(req.user.merchantId, req.params.id));
  }),
);

franchiseRouter.post(
  "/partners/sync-catalog",
  ...ownerOnly,
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();
    res.json(await partners.syncCatalogToAllPartners(req.user.merchantId));
  }),
);

franchiseRouter.post(
  "/partners/:id/sync-catalog",
  ...ownerOnly,
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();
    res.json(await partners.syncCatalogToPartner(req.user.merchantId, req.params.id));
  }),
);

franchiseRouter.get(
  "/partners/statements",
  ...ownerOnly,
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }).parse(req.query);
    res.json(await partners.listPartnerStatements(req.user.merchantId, limit));
  }),
);

franchiseRouter.post(
  "/partners/statements/generate",
  ...ownerOnly,
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();
    const body = z.object({ periodStart: z.string().optional(), periodEnd: z.string().optional() }).parse(req.body ?? {});
    res.json(await partners.generatePartnerStatements(req.user.merchantId, body));
  }),
);

franchiseRouter.patch(
  "/partners/statements/:id",
  ...ownerOnly,
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();
    const { status } = z.object({ status: z.enum(["issued", "paid"]) }).parse(req.body);
    res.json(await partners.setPartnerStatementStatus(req.user.merchantId, req.params.id, status));
  }),
);

// Franchisee side — not gated by the franchise feature; any plan can join
// someone else's brand and see what it owes.
franchiseRouter.post(
  "/join",
  requireAuth,
  requireRole("owner"),
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();
    const { code } = z.object({ code: z.string().min(1) }).parse(req.body);
    res.json(await partners.redeemJoinCode(req.user.merchantId, code));
  }),
);

franchiseRouter.get(
  "/membership",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();
    res.json(await partners.getMembership(req.user.merchantId));
  }),
);

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
