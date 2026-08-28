import { Request, Response } from "express";
import { z } from "zod";
import { requireOutlet } from "../../middleware/outlet";
import { unauthorized } from "../../utils/errors";
import * as expensesService from "./expenses.service";

const createExpenseSchema = z.object({
  amount: z.number().int().positive(),
  note: z.string().trim().min(1).optional(),
});

export async function createExpenseHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const body = createExpenseSchema.parse(req.body);
  const expense = await expensesService.createExpense(
    req.user.merchantId,
    req.user.userId,
    requireOutlet(req),
    body,
  );
  res.json(expense);
}

const listExpensesQuerySchema = z.object({
  shiftId: z.string().uuid().optional(),
});

export async function listExpensesHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const { shiftId } = listExpensesQuerySchema.parse(req.query);
  const expenses = await expensesService.listExpenses(req.user.merchantId, requireOutlet(req), shiftId);
  res.json(expenses);
}
