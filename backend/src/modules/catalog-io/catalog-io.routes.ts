import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import {
  commitImportHandler,
  exportImportTemplateHandler,
  exportSalesLedgerHandler,
  exportStockValuationHandler,
  previewImportHandler,
} from "./catalog-io.controller";

export const catalogIoRouter = Router();
catalogIoRouter.get("/import/template", requireAuth, asyncHandler(exportImportTemplateHandler));
catalogIoRouter.post("/import/preview", requireAuth, asyncHandler(previewImportHandler));
catalogIoRouter.post("/import/commit", requireAuth, asyncHandler(commitImportHandler));
catalogIoRouter.get("/export/sales-ledger", requireAuth, asyncHandler(exportSalesLedgerHandler));
catalogIoRouter.get("/export/stock-valuation", requireAuth, asyncHandler(exportStockValuationHandler));
