import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import {
  commitImportHandler,
  exportSalesLedgerHandler,
  exportStockValuationHandler,
  previewImportHandler,
} from "./catalog-io.controller";

export const catalogIoRouter = Router();
catalogIoRouter.post("/import/preview", requireAuth, asyncHandler(previewImportHandler));
catalogIoRouter.post("/import/commit", requireAuth, asyncHandler(commitImportHandler));
catalogIoRouter.get("/export/sales-ledger", requireAuth, asyncHandler(exportSalesLedgerHandler));
catalogIoRouter.get("/export/stock-valuation", requireAuth, asyncHandler(exportStockValuationHandler));
