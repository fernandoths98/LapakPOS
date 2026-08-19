import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { getMyMerchantHandler } from "./merchant.controller";

export const merchantRouter = Router();
merchantRouter.get("/me", requireAuth, asyncHandler(getMyMerchantHandler));
