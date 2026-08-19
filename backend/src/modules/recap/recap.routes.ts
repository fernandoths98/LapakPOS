import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import {
  getAskHistoryHandler,
  getDailyRecapHandler,
  getWeeklyReportsHandler,
  postAskHandler,
  regenerateDailyRecapHandler,
} from "./recap.controller";

export const recapRouter = Router();
recapRouter.get("/daily", requireAuth, asyncHandler(getDailyRecapHandler));
recapRouter.post("/daily/regenerate", requireAuth, asyncHandler(regenerateDailyRecapHandler));
recapRouter.get("/reports/weekly", requireAuth, asyncHandler(getWeeklyReportsHandler));
// Must be registered before any "/:id"-shaped route this router might grow later.
recapRouter.get("/ask/history", requireAuth, asyncHandler(getAskHistoryHandler));
recapRouter.post("/ask", requireAuth, asyncHandler(postAskHandler));
