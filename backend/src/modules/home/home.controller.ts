import { Request, Response } from "express";
import { unauthorized } from "../../utils/errors";
import * as homeService from "./home.service";

export async function getHomeAlertsHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const result = await homeService.getHomeAlerts(req.user.merchantId);
  res.json(result);
}
