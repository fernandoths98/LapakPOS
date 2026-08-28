import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { resolveOutlet } from "../../middleware/outlet";
import { createSaleHandler, getSaleHandler, getSalesHandler, getTodaySummaryHandler } from "./sales.controller";

export const salesRouter = Router();
salesRouter.post("/", requireAuth, resolveOutlet, asyncHandler(createSaleHandler));
// Must be registered before "/:id" so "summary" isn't swallowed as a sale id.
salesRouter.get("/summary/today", requireAuth, resolveOutlet, asyncHandler(getTodaySummaryHandler));
salesRouter.get("/", requireAuth, resolveOutlet, asyncHandler(getSalesHandler));
salesRouter.get("/:id", requireAuth, asyncHandler(getSaleHandler));
