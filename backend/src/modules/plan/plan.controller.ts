import { Request, Response } from "express";
import { unauthorized } from "../../utils/errors";
import * as planService from "./plan.service";

export async function getPlanHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  res.json(await planService.getPlan(req.user.merchantId));
}
