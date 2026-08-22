import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { createSaleHandler, getSaleHandler, getSalesHandler, getTodaySummaryHandler } from "./sales.controller";

export const salesRouter = Router();
salesRouter.post("/", requireAuth, asyncHandler(createSaleHandler));
// Must be registered before "/:id" so "summary" isn't swallowed as a sale id.
salesRouter.get("/summary/today", requireAuth, asyncHandler(getTodaySummaryHandler));
salesRouter.get("/", requireAuth, asyncHandler(getSalesHandler));
salesRouter.get("/:id", requireAuth, asyncHandler(getSaleHandler));
