import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { getHomeAlertsHandler } from "./home.controller";

export const homeRouter = Router();
homeRouter.get("/alerts", requireAuth, asyncHandler(getHomeAlertsHandler));
