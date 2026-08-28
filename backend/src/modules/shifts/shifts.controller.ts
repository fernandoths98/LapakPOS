import { Request, Response } from "express";
import { z } from "zod";
import { requireOutlet } from "../../middleware/outlet";
import { unauthorized } from "../../utils/errors";
import * as shiftsService from "./shifts.service";

export async function getCurrentShiftHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const result = await shiftsService.getCurrentShift(req.user.merchantId, requireOutlet(req));
  res.json(result);
}

const openShiftSchema = z.object({
  openingFloat: z.number().int().nonnegative(),
});

export async function openShiftHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const body = openShiftSchema.parse(req.body);
  const shift = await shiftsService.openShift(req.user.merchantId, req.user.userId, requireOutlet(req), body);
  res.json(shift);
}

const closeShiftSchema = z.object({
  countedCash: z.number().int().nonnegative(),
});

export async function closeShiftHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const body = closeShiftSchema.parse(req.body);
  const result = await shiftsService.closeShift(req.user.merchantId, req.params.id, body);
  res.json(result);
}

export async function getZReportHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const result = await shiftsService.getZReport(req.user.merchantId, req.params.id);
  res.json(result);
}
