import { CreateExpenseRequest, Expense as ExpenseDto, ExpenseSource } from "@lapak/shared";
import { Expense } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { badRequest } from "../../utils/errors";
import { getOrOpenCurrentShift } from "../shifts/shifts.service";

function toExpenseDto(expense: Expense): ExpenseDto {
  return {
    id: expense.id,
    merchantId: expense.merchantId,
    shiftId: expense.shiftId,
    amount: expense.amount,
    note: expense.note,
    photoUrl: expense.photoUrl,
    source: expense.source as ExpenseSource,
    createdAt: expense.createdAt.toISOString(),
  };
}

/**
 * Records a cash-out-of-drawer expense against the caller's current shift,
 * reusing the same `getOrOpenCurrentShift` safety net sales.service relies on
 * so an expense never needs its own shift-lookup logic. `source` is always
 * `manual` for now — the prototype's "Snap a note" AI photo-capture (writing
 * `ai_photo`) is Phase 6's job; the column exists already and just goes
 * unused until then.
 */
export async function createExpense(
  merchantId: string,
  userId: string,
  body: CreateExpenseRequest,
): Promise<ExpenseDto> {
  if (body.amount <= 0) {
    throw badRequest("Expense amount must be greater than 0");
  }

  const shift = await getOrOpenCurrentShift(merchantId, userId);

  const expense = await prisma.expense.create({
    data: {
      merchantId,
      shiftId: shift.id,
      amount: body.amount,
      note: body.note?.trim() || null,
      source: "manual",
    },
  });
  return toExpenseDto(expense);
}

/**
 * Lists expenses, newest first. Explicit `shiftId` scopes to that shift;
 * omitted, it defaults to the merchant's currently open shift — if there
 * isn't one, there is no "current shift" to list expenses for, so this
 * returns an empty list rather than silently falling back to every expense
 * the merchant has ever recorded.
 */
export async function listExpenses(merchantId: string, shiftId?: string): Promise<ExpenseDto[]> {
  let scopedShiftId = shiftId;
  if (!scopedShiftId) {
    const currentShift = await prisma.shift.findFirst({
      where: { merchantId, status: "open" },
      orderBy: { openedAt: "desc" },
    });
    if (!currentShift) {
      return [];
    }
    scopedShiftId = currentShift.id;
  }

  const expenses = await prisma.expense.findMany({
    where: { merchantId, shiftId: scopedShiftId },
    orderBy: { createdAt: "desc" },
  });
  return expenses.map(toExpenseDto);
}
