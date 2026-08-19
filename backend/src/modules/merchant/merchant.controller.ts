import { Request, Response } from "express";
import { unauthorized } from "../../utils/errors";
import * as merchantService from "./merchant.service";

export async function getMyMerchantHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const merchant = await merchantService.getMyMerchant(req.user.merchantId);
  res.json(merchant);
}
