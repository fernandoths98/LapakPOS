import { Request, Response } from "express";
import { unauthorized } from "../../utils/errors";
import * as merchantService from "./merchant.service";
import { z } from "zod";

export async function getMyMerchantHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const merchant = await merchantService.getMyMerchant(req.user.merchantId);
  res.json(merchant);
}
export async function getAccountSetupHandler(req: Request, res: Response): Promise<void> { if (!req.user) throw unauthorized(); res.json(await merchantService.getAccountSetup(req.user.merchantId)); }
const outletSchema = z.object({ name: z.string().trim().min(2).max(100), code: z.string().trim().min(2).max(12).regex(/^[a-zA-Z0-9_-]+$/), address: z.string().max(240).optional(), phone: z.string().max(24).optional() });
export async function createOutletHandler(req: Request, res: Response): Promise<void> { if (!req.user) throw unauthorized(); res.status(201).json(await merchantService.createOutlet(req.user.merchantId, outletSchema.parse(req.body))); }
const staffSchema = z.object({ name: z.string().trim().min(2).max(80), email: z.string().email().optional(), role: z.enum(["manager", "cashier", "stocker"]), outletId: z.string().uuid(), pin: z.string().regex(/^\d{4,6}$/), password: z.string().min(8).max(128).optional() });
export async function createStaffHandler(req: Request, res: Response): Promise<void> { if (!req.user) throw unauthorized(); res.status(201).json(await merchantService.createStaff(req.user.merchantId, staffSchema.parse(req.body))); }
