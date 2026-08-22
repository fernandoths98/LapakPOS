import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import { createOutletHandler, createStaffHandler, getAccountSetupHandler, getMyMerchantHandler } from "./merchant.controller";

export const merchantRouter = Router();
merchantRouter.get("/me", requireAuth, asyncHandler(getMyMerchantHandler));
merchantRouter.get("/account-setup", requireAuth, requireRole("owner", "manager"), asyncHandler(getAccountSetupHandler));
merchantRouter.post("/outlets", requireAuth, requireRole("owner"), asyncHandler(createOutletHandler));
merchantRouter.post("/staff", requireAuth, requireRole("owner", "manager"), asyncHandler(createStaffHandler));
