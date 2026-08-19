import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import {
  checkBillHandler,
  getBillersHandler,
  getCommissionSummaryHandler,
  getTransactionsHandler,
  payBillHandler,
} from "./ppob.controller";

export const ppobRouter = Router();
ppobRouter.get("/billers", requireAuth, asyncHandler(getBillersHandler));
ppobRouter.post("/check-bill", requireAuth, asyncHandler(checkBillHandler));
ppobRouter.post("/pay-bill", requireAuth, asyncHandler(payBillHandler));
ppobRouter.get("/transactions", requireAuth, asyncHandler(getTransactionsHandler));
ppobRouter.get("/commission/summary", requireAuth, asyncHandler(getCommissionSummaryHandler));
