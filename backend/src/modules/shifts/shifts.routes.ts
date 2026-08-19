import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import {
  closeShiftHandler,
  getCurrentShiftHandler,
  getZReportHandler,
  openShiftHandler,
} from "./shifts.controller";

export const shiftsRouter = Router();
shiftsRouter.get("/current", requireAuth, asyncHandler(getCurrentShiftHandler));
shiftsRouter.post("/open", requireAuth, asyncHandler(openShiftHandler));
shiftsRouter.post("/:id/close", requireAuth, asyncHandler(closeShiftHandler));
shiftsRouter.get("/:id/z-report", requireAuth, asyncHandler(getZReportHandler));
