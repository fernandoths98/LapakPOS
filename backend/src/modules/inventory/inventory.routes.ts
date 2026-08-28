import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import { resolveOutlet } from "../../middleware/outlet";
import { listInventoryHandler, updateInventoryHandler } from "./inventory.controller";

export const inventoryRouter = Router();
inventoryRouter.get("/", requireAuth, resolveOutlet, asyncHandler(listInventoryHandler));
inventoryRouter.patch(
  "/:productId",
  requireAuth,
  requireRole("owner", "manager", "stocker"),
  resolveOutlet,
  asyncHandler(updateInventoryHandler),
);
