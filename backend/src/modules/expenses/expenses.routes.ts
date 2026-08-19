import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { createExpenseHandler, listExpensesHandler } from "./expenses.controller";

export const expensesRouter = Router();
expensesRouter.post("/", requireAuth, asyncHandler(createExpenseHandler));
expensesRouter.get("/", requireAuth, asyncHandler(listExpensesHandler));
