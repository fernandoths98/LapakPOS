import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { resolveOutlet } from "../../middleware/outlet";
import {
  checkBillHandler,
  getBillersHandler,
  getCommissionSummaryHandler,
  getTransactionsHandler,
  payBillHandler,
  digiflazzWebhookHandler,
  getProviderStatusHandler,
  getPrepaidProductsHandler,
} from "./ppob.controller";
import { createWalletTopupHandler, nusapayWebhookHandler, walletLedgerHandler, walletSummaryHandler, walletTopupsHandler } from "./wallet.controller";

export const ppobRouter = Router();
ppobRouter.post("/webhooks/digiflazz", asyncHandler(digiflazzWebhookHandler));
ppobRouter.post("/webhooks/nusapay", asyncHandler(nusapayWebhookHandler));
ppobRouter.get("/wallet", requireAuth, asyncHandler(walletSummaryHandler));
ppobRouter.get("/wallet/ledger", requireAuth, asyncHandler(walletLedgerHandler));
ppobRouter.get("/wallet/topups", requireAuth, asyncHandler(walletTopupsHandler));
ppobRouter.post("/wallet/topups", requireAuth, asyncHandler(createWalletTopupHandler));
ppobRouter.get("/provider-status", requireAuth, asyncHandler(getProviderStatusHandler));
ppobRouter.get("/billers", requireAuth, asyncHandler(getBillersHandler));
ppobRouter.get("/prepaid-products", requireAuth, asyncHandler(getPrepaidProductsHandler));
ppobRouter.post("/check-bill", requireAuth, asyncHandler(checkBillHandler));
ppobRouter.post("/pay-bill", requireAuth, resolveOutlet, asyncHandler(payBillHandler));
ppobRouter.get("/transactions", requireAuth, resolveOutlet, asyncHandler(getTransactionsHandler));
ppobRouter.get("/commission/summary", requireAuth, asyncHandler(getCommissionSummaryHandler));
