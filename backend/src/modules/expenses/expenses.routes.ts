import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { resolveOutlet } from "../../middleware/outlet";
import { createExpenseHandler, listExpensesHandler } from "./expenses.controller";

export const expensesRouter = Router();
expensesRouter.post("/", requireAuth, resolveOutlet, asyncHandler(createExpenseHandler));
expensesRouter.get("/", requireAuth, resolveOutlet, asyncHandler(listExpensesHandler));
