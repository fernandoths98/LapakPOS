import {
  CloseShiftRequest,
  GetCurrentShiftResponse,
  OpenShiftRequest,
  CloseShiftResponse,
  Shift as ShiftDto,
  ShiftRunningTotals,
  ShiftStatus,
  ZReportResponse,
  formatRupiah,
} from "@lapak/shared";
import { Prisma, Shift as PrismaShift } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { aiEnabled } from "../../config/env";
import { badRequest, notFound } from "../../utils/errors";
import { explainDiscrepancyWithAi, findDiscrepancyCandidates } from "./discrepancyAi.service";

type Db = Prisma.TransactionClient | typeof prisma;
type ShiftWithUser = Prisma.ShiftGetPayload<{ include: { user: true } }>;

/**
 * Internal groundwork for Phase 5's real shift open/close UI. Sales must
 * belong to a shift (`Sale.shiftId` is a required FK), but real shift
 * open/close endpoints don't exist yet — so this quietly opens a
 * zero-float shift the first time a merchant/user sells with none open,
 * and reuses it for every sale after that. Phase 5 builds the actual
 * open/close endpoints on this exact same `Shift` model; no rework needed.
 *
 * Accepts an optional transaction client so callers (sales.service) can run
 * this inside the same `$transaction` as the sale it's opening a shift for.
 */
export async function getOrOpenCurrentShift(
  merchantId: string,
  userId: string,
  outletId: string,
  db: Db = prisma,
): Promise<PrismaShift> {
  const existing = await db.shift.findFirst({
    where: { merchantId, outletId, userId, status: "open" },
    orderBy: { openedAt: "desc" },
  });
  if (existing) {
    return existing;
  }

  return db.shift.create({
    data: { merchantId, outletId, userId, openingFloat: 0 },
  });
}

// ── Phase 5: explicit shift open/close ──────────────────────────────────

function toShiftDto(shift: ShiftWithUser): ShiftDto {
  return {
    id: shift.id,
    merchantId: shift.merchantId,
    outletId: shift.outletId,
    userId: shift.userId,
    userName: shift.user.name,
    openedAt: shift.openedAt.toISOString(),
    closedAt: shift.closedAt ? shift.closedAt.toISOString() : null,
    openingFloat: shift.openingFloat,
    countedCash: shift.countedCash,
    expectedCash: shift.expectedCash,
    status: shift.status as ShiftStatus,
  };
}

/**
 * Sums cash actually in the drawer for this shift:
 *  - `cashSales`: `sales.cashAmount` across every sale attached to the shift
 *    — already the right number for both `cash` sales and the cash leg of a
 *    `split` sale, per the tender-bookkeeping rules `assertTenderAmountsConsistent`
 *    enforces in sales.service.
 *  - `ppobCashIn`: `ppob_transactions.totalCharged` for `success` transactions
 *    only. Assumption: every PPOB bill payment is collected in cash from the
 *    customer — realistic for a warung, and there is no separate PPOB
 *    tender-type column in the schema to say otherwise.
 *  - `paidOut`: every expense attached to the shift, assumed paid straight
 *    out of the cash drawer.
 */
async function computeRunningTotals(
  merchantId: string,
  shiftId: string,
  openingFloat: number,
  db: Db = prisma,
): Promise<ShiftRunningTotals> {
  const [cashSalesAgg, ppobAgg, expensesAgg] = await Promise.all([
    db.sale.aggregate({ where: { merchantId, shiftId }, _sum: { cashAmount: true } }),
    db.ppobTransaction.aggregate({
      where: { merchantId, shiftId, status: "success" },
      _sum: { totalCharged: true },
    }),
    db.expense.aggregate({ where: { merchantId, shiftId }, _sum: { amount: true } }),
  ]);

  const cashSales = cashSalesAgg._sum.cashAmount ?? 0;
  const ppobCashIn = ppobAgg._sum.totalCharged ?? 0;
  const paidOut = expensesAgg._sum.amount ?? 0;
  const expectedCash = openingFloat + cashSales + ppobCashIn - paidOut;

  return { openingFloat, cashSales, ppobCashIn, paidOut, expectedCash };
}

/**
 * The plain, rule-based discrepancy message (title always; body when there's
 * no AI-phrased upgrade) — arithmetic only, no candidate cause guessed at.
 * This is `closeShift`'s permanent fallback: whenever `!aiEnabled`, no
 * matching candidate transaction(s) exist, or the live Claude call fails,
 * the merchant sees this honest generic text instead of a fabricated
 * specific cause. See `resolveDiscrepancyBody` below for the AI upgrade
 * path (Phase 6b) that tries to do better than this when it genuinely can.
 */
function buildDiscrepancyMessage(diff: number): { title: string; body: string } {
  if (diff === 0) {
    return {
      title: "Drawer balances",
      body: "Counted cash matches what today's sales, PPOB and expenses add up to. Nothing to review.",
    };
  }
  const isShort = diff > 0;
  const title = isShort ? `Short by ${formatRupiah(diff)}` : `Over by ${formatRupiah(-diff)}`;
  const body =
    `Counted cash is ${formatRupiah(Math.abs(diff))} ${isShort ? "short of" : "over"} what today's sales, ` +
    "PPOB and expenses add up to. Recount the drawer or review today's transactions before closing.";
  return { title, body };
}

/**
 * The merchant's currently open shift plus its live running totals, or nulls
 * if nothing is open. Scoped to the merchant (not the caller's own user id)
 * since a real warung shift is one drawer shared by whoever is on it — the
 * explicit open/close flow this phase adds enforces one open shift per
 * merchant at a time (see `openShift`), unlike `getOrOpenCurrentShift`'s
 * per-user auto-open fallback above, which is unchanged and still scoped per user.
 */
export async function getCurrentShift(merchantId: string, outletId: string): Promise<GetCurrentShiftResponse> {
  const shift = await prisma.shift.findFirst({
    where: { merchantId, outletId, status: "open" },
    orderBy: { openedAt: "desc" },
    include: { user: true },
  });
  if (!shift) {
    return { shift: null, running: null };
  }
  const running = await computeRunningTotals(merchantId, shift.id, shift.openingFloat);
  return { shift: toShiftDto(shift), running };
}

/**
 * Explicit, user-initiated shift open — the normal start-of-day flow, distinct
 * from `getOrOpenCurrentShift`'s defensive zero-float auto-open. Rejects if
 * the merchant already has a shift open; only one drawer is ever live at a time.
 */
export async function openShift(
  merchantId: string,
  userId: string,
  outletId: string,
  body: OpenShiftRequest,
): Promise<ShiftDto> {
  if (body.openingFloat < 0) {
    throw badRequest("Opening float cannot be negative");
  }

  const existing = await prisma.shift.findFirst({ where: { merchantId, outletId, status: "open" } });
  if (existing) {
    throw badRequest("A shift is already open for this outlet. Close it before opening a new one.");
  }

  const shift = await prisma.shift.create({
    data: { merchantId, outletId, userId, openingFloat: body.openingFloat },
    include: { user: true },
  });
  return toShiftDto(shift);
}

/**
 * Tries to upgrade the honest generic discrepancy body into an AI-phrased,
 * specific-sounding one grounded in real matching transactions — the phase 6b
 * upgrade to Phase 5a's `buildDiscrepancyMessage`. Deliberately runs AFTER
 * the shift-close DB transaction has committed, not inside it: candidate
 * search + the Claude call are read-only against data that transaction
 * already wrote, and neither should hold a DB transaction open while
 * waiting on a network call to Anthropic.
 *
 * Only attempts an upgrade when `aiEnabled` AND `discrepancy !== 0` (a
 * balanced drawer has nothing to explain). Falls back to `genericBody` in
 * every other case: AI disabled, no candidate transaction(s) found (this is
 * the important one — NEVER fabricate a specific cause when none genuinely
 * matches), or the live Claude call itself fails for any reason.
 */
async function resolveDiscrepancyBody(
  merchantId: string,
  shiftId: string,
  discrepancy: number,
  genericBody: string,
): Promise<string> {
  if (!aiEnabled || discrepancy === 0) {
    return genericBody;
  }

  const candidates = await findDiscrepancyCandidates(merchantId, shiftId, Math.abs(discrepancy));
  if (candidates.length === 0) {
    // No real transaction (or small combination of them) actually matches
    // the gap — stay with the honest generic message rather than inventing
    // a plausible-sounding but fabricated specific cause.
    return genericBody;
  }

  const aiBody = await explainDiscrepancyWithAi(discrepancy, candidates);
  return aiBody ?? genericBody;
}

/**
 * Closes a shift: computes the same running totals `getCurrentShift` previews,
 * records the cashier's counted cash against them, and stores the result on
 * the shift row. `expected = openingFloat + cashSales + ppobCashIn - paidOut`;
 * `discrepancy = expected - counted` (positive = short, negative = over).
 *
 * `discrepancyBody` is sometimes AI-phrased from real matching transactions
 * and always falls back to Phase 5a's honest arithmetic-only text — see
 * `resolveDiscrepancyBody` above. `discrepancyTitle` is always the plain
 * arithmetic title regardless: only the explanatory body is ever AI-phrased.
 */
export async function closeShift(
  merchantId: string,
  shiftId: string,
  body: CloseShiftRequest,
): Promise<CloseShiftResponse> {
  if (body.countedCash < 0) {
    throw badRequest("Counted cash cannot be negative");
  }

  const { updated, running, discrepancy } = await prisma.$transaction(async (tx) => {
    const shift = await tx.shift.findFirst({ where: { id: shiftId, merchantId }, include: { user: true } });
    if (!shift) {
      throw notFound("Shift");
    }
    if (shift.status !== "open") {
      throw badRequest("This shift is already closed");
    }

    const running = await computeRunningTotals(merchantId, shift.id, shift.openingFloat, tx);
    const discrepancy = running.expectedCash - body.countedCash;

    const updated = await tx.shift.update({
      where: { id: shift.id },
      data: {
        closedAt: new Date(),
        countedCash: body.countedCash,
        expectedCash: running.expectedCash,
        status: "closed",
      },
      include: { user: true },
    });

    return { updated, running, discrepancy };
  });

  const { title, body: genericBody } = buildDiscrepancyMessage(discrepancy);
  const discrepancyBody = await resolveDiscrepancyBody(merchantId, updated.id, discrepancy, genericBody);

  return {
    shift: toShiftDto(updated),
    expectedCash: running.expectedCash,
    countedCash: body.countedCash,
    discrepancy,
    discrepancyTitle: title,
    discrepancyBody,
  };
}

/**
 * The Z-report *data* (not a printed document — thermal printing is Phase 7):
 * the same row-by-row breakdown as `closeShift`, computable for an open shift
 * too (`discrepancy` is null until the shift has a `countedCash` to compare).
 */
export async function getZReport(merchantId: string, shiftId: string): Promise<ZReportResponse> {
  const shift = await prisma.shift.findFirst({ where: { id: shiftId, merchantId }, include: { user: true } });
  if (!shift) {
    throw notFound("Shift");
  }

  const running = await computeRunningTotals(merchantId, shift.id, shift.openingFloat);
  const discrepancy = shift.countedCash !== null ? running.expectedCash - shift.countedCash : null;

  return { shift: toShiftDto(shift), running, discrepancy };
}
