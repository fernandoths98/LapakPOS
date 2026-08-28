import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import {
  checkoutHandler,
  getEntitlementsHandler,
  getInvoicesHandler,
  getPlansHandler,
  getSubscriptionHandler,
  nusapayWebhookHandler,
} from "./subscription.controller";

export const subscriptionRouter = Router();

// Unauthenticated: the NusaPay gateway posts here (guarded by a shared key).
subscriptionRouter.post("/webhooks/nusapay", asyncHandler(nusapayWebhookHandler));

subscriptionRouter.get("/", requireAuth, asyncHandler(getSubscriptionHandler));
subscriptionRouter.get("/entitlements", requireAuth, asyncHandler(getEntitlementsHandler));
subscriptionRouter.get("/plans", requireAuth, asyncHandler(getPlansHandler));
subscriptionRouter.get("/invoices", requireAuth, asyncHandler(getInvoicesHandler));
subscriptionRouter.post("/checkout", requireAuth, requireRole("owner"), asyncHandler(checkoutHandler));
