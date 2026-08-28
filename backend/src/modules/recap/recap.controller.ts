import { Request, Response } from "express";
import { z } from "zod";
import { unauthorized } from "../../utils/errors";
import * as recapService from "./recap.service";
import * as askService from "./ask.service";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be formatted YYYY-MM-DD")
  .optional();

const dailyQuerySchema = z.object({ date: dateSchema });
const regenerateBodySchema = z.object({ date: dateSchema });

export async function getDailyRecapHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const { date } = dailyQuerySchema.parse(req.query);
  const result = await recapService.getDailyRecap(req.user.merchantId, date);
  res.json(result);
}

export async function regenerateDailyRecapHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const { date } = regenerateBodySchema.parse(req.body ?? {});
  const result = await recapService.regenerateDailyRecap(req.user.merchantId, date);
  res.json(result);
}

export async function getWeeklyReportsHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const result = await recapService.getWeeklyReports(req.user.merchantId);
  res.json(result);
}

// ── Ask tab: GET /api/recap/ask/history, POST /api/recap/ask ───────────────

export async function getAskHistoryHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const result = await askService.getAskHistory(req.user.merchantId, req.user.userId);
  res.json(result);
}

const askBodySchema = z.object({ message: z.string().trim().min(1).max(500) });

export async function postAskHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const { message } = askBodySchema.parse(req.body);
  const result = await askService.postAsk(req.user.merchantId, req.user.userId, message);
  res.json(result);
}
