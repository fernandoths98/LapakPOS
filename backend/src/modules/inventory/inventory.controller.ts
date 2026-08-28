import { Request, Response } from "express";
import { z } from "zod";
import { requireOutlet } from "../../middleware/outlet";
import { unauthorized } from "../../utils/errors";
import * as inventoryService from "./inventory.service";

export async function listInventoryHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  res.json(await inventoryService.listInventory(req.user.merchantId, requireOutlet(req)));
}

const updateSchema = z.object({
  stockQty: z.number().int().nonnegative().optional(),
  lowStockThreshold: z.number().int().nonnegative().optional(),
  priceOverride: z.number().int().nonnegative().nullable().optional(),
  isAvailable: z.boolean().optional(),
});

export async function updateInventoryHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const body = updateSchema.parse(req.body);
  res.json(await inventoryService.updateInventory(req.user.merchantId, requireOutlet(req), req.params.productId, body));
}
