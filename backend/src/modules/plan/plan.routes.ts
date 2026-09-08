import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { getPlanHandler } from "./plan.controller";

export const planRouter = Router();
planRouter.get("/me", requireAuth, asyncHandler(getPlanHandler));
