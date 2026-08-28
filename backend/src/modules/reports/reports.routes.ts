import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import { unauthorized } from "../../utils/errors";
import { getOutletReports } from "./reports.service";

export const reportsRouter = Router();

reportsRouter.get(
  "/outlets",
  requireAuth,
  requireRole("owner", "manager"),
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(3650).default(7) }).parse(req.query);
    res.json(await getOutletReports(req.user.merchantId, days));
  }),
);
