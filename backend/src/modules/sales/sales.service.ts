import { CreateSaleRequest, Sale, SaleStatus, TenderType, TodaySummaryResponse } from "@lapak/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { badRequest, notFound } from "../../utils/errors";
import { getOrOpenCurrentShift } from "../shifts/shifts.service";
import { resolvePlan } from "../subscription/entitlements.service";

/**
 * Midnight-to-midnight boundaries for the calendar day containing `at`, in
 * server-local time. Exported for reuse by other modules (recap aggregation)
 * that need the same day-bucketing rule.
 */
export function dayBounds(at: Date): { start: Date; end: Date } {
  const start = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

type SaleWithLines = Prisma.SaleGetPayload<{ include: { lineItems: true } }>;

function toSaleDto(sale: SaleWithLines): Sale {
  return {
    id: sale.id,
    merchantId: sale.merchantId,
    outletId: sale.outletId,
    shiftId: sale.shiftId,
    orderNo: sale.orderNo,
    clientId: sale.clientId,
    tenderType: sale.tenderType as TenderType,
    cashAmount: sale.cashAmount,
    qrisAmount: sale.qrisAmount,
    subtotal: sale.subtotal,
    discount: sale.discount,
    total: sale.total,
    status: sale.status as SaleStatus,
    createdAt: sale.createdAt.toISOString(),
    createdOffline: sale.createdOffline,
    lineItems: sale.lineItems.map((li) => ({
      id: li.id,
      productId: li.productId,
      productName: li.productNameSnapshot,
      unitPrice: li.unitPriceSnapshot,
      qty: li.qty,
      lineTotal: li.lineTotal,
    })),
  };
}

/**
 * Cross-checks the client-declared cash/QRIS split against the authoritative
 * total, per the tender-bookkeeping rules settled for this phase:
 *  - cash:  cashAmount === total, qrisAmount === 0
 *  - qris:  qrisAmount === total, cashAmount === 0
 *  - debit: both 0 (debit isn't tracked in either bucket — the prototype's
 *           own Home tender-mix breakdown only shows Cash/QRIS/PPOB, so this
 *           is a deliberate, consistent omission, not a gap)
 *  - split: cashAmount + qrisAmount === total, in whatever ratio the client sent
 * Rejects anything else so a buggy/malicious client can't record a wrong total.
 */
function assertTenderAmountsConsistent(tenderType: TenderType, cashAmount: number, qrisAmount: number, total: number): void {
  if (cashAmount < 0 || qrisAmount < 0) {
    throw badRequest("Tender amounts cannot be negative");
  }
  switch (tenderType) {
    case "cash":
      if (cashAmount !== total || qrisAmount !== 0) {
        throw badRequest("Cash sales must have cashAmount equal to the total and qrisAmount of 0");
      }
      break;
    case "qris":
      if (qrisAmount !== total || cashAmount !== 0) {
        throw badRequest("QRIS sales must have qrisAmount equal to the total and cashAmount of 0");
      }
      break;
    case "debit":
      if (cashAmount !== 0 || qrisAmount !== 0) {
        throw badRequest("Debit sales must have cashAmount and qrisAmount of 0");
      }
      break;
    case "split":
      if (cashAmount + qrisAmount !== total) {
        throw badRequest("Split cashAmount + qrisAmount must equal the total");
      }
      break;
  }
}

/**
 * Creates a sale inside a single transaction: opens/reuses the current
 * shift, prices every line from the live product record (never the client's
 * numbers), rejects overselling, snapshots name/price on each line item, and
 * decrements stock.
 *
 * Idempotent on `clientId` — required for the offline-sync retry story
 * (Phase 8): if a sale with this `clientId` already exists it's returned
 * unchanged rather than erroring or double-decrementing stock, so a client
 * can safely retry a POST it's unsure landed.
 */
export async function createSale(
  merchantId: string,
  userId: string,
  outletId: string,
  body: CreateSaleRequest,
): Promise<Sale> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.sale.findUnique({
      where: { clientId: body.clientId },
      include: { lineItems: true },
    });
    if (existing) {
      if (existing.merchantId !== merchantId) {
        throw badRequest("This clientId was already used for a different merchant's sale");
      }
      return toSaleDto(existing);
    }

    if (body.lineItems.length === 0) {
      throw badRequest("A sale needs at least one line item");
    }

    const productIds = [...new Set(body.lineItems.map((li) => li.productId))];
    // Price and stock are the selling outlet's own — priceOverride wins over
    // the product's reference sell price, and stock is decremented per outlet.
    const inventory = await tx.outletProduct.findMany({
      where: { outletId, deletedAt: null, productId: { in: productIds }, product: { merchantId, deletedAt: null } },
      include: { product: true },
    });
    const invByProduct = new Map(inventory.map((op) => [op.productId, op]));

    let subtotal = 0;
    const linePlans = body.lineItems.map((li) => {
      if (!Number.isInteger(li.qty) || li.qty <= 0) {
        throw badRequest("Line item qty must be a positive whole number");
      }
      const op = invByProduct.get(li.productId);
      if (!op) {
        throw badRequest(`Product ${li.productId} not found at this outlet`);
      }
      if (op.stockQty < li.qty) {
        throw badRequest(`Not enough stock for ${op.product.name} (${op.stockQty} left)`);
      }
      const unitPrice = op.priceOverride ?? op.product.sellPrice;
      const lineTotal = unitPrice * li.qty;
      subtotal += lineTotal;
      return { productId: op.productId, name: op.product.name, unitPrice, qty: li.qty, lineTotal };
    });

    const discount = body.discount ?? 0;
    if (!Number.isInteger(discount) || discount < 0 || discount > subtotal) {
      throw badRequest("Discount must be a whole amount between 0 and the subtotal");
    }
    const total = subtotal - discount;
    assertTenderAmountsConsistent(body.tenderType, body.cashAmount, body.qrisAmount, total);

    const shift = await getOrOpenCurrentShift(merchantId, userId, outletId, tx);
    const orderNo = String(1000 + (await tx.sale.count({ where: { outletId } })));

    const sale = await tx.sale.create({
      data: {
        merchantId,
        outletId,
        shiftId: shift.id,
        orderNo,
        clientId: body.clientId,
        tenderType: body.tenderType,
        cashAmount: body.cashAmount,
        qrisAmount: body.qrisAmount,
        subtotal,
        discount,
        total,
        createdOffline: body.createdOffline ?? false,
        lineItems: {
          create: linePlans.map((plan) => ({
            productId: plan.productId,
            productNameSnapshot: plan.name,
            unitPriceSnapshot: plan.unitPrice,
            qty: plan.qty,
            lineTotal: plan.lineTotal,
          })),
        },
      },
      include: { lineItems: true },
    });

    for (const plan of linePlans) {
      await tx.outletProduct.update({
        where: { outletId_productId: { outletId, productId: plan.productId } },
        data: { stockQty: { decrement: plan.qty } },
      });
    }

    return toSaleDto(sale);
  });
}

export async function getSaleById(merchantId: string, id: string): Promise<Sale> {
  const sale = await prisma.sale.findFirst({ where: { id, merchantId }, include: { lineItems: true } });
  if (!sale) {
    throw notFound("Sale");
  }
  return toSaleDto(sale);
}

export async function getRecentSales(merchantId: string, outletId: string | undefined, limit = 50): Promise<Sale[]> {
  // The plan's report-history window caps how far back the list can reach —
  // a free-plan merchant sees the last 7 days, not the last 50 sales ever.
  const { entitlements } = await resolvePlan(merchantId);
  const cutoff = new Date(Date.now() - entitlements.reportHistoryDays * 86_400_000);

  const sales = await prisma.sale.findMany({
    where: { merchantId, ...(outletId ? { outletId } : {}), createdAt: { gte: cutoff } },
    include: { lineItems: true },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
  });
  return sales.map(toSaleDto);
}

export interface DayRevenue {
  /** Sales `total` (all tender types, including `debit`) + successful PPOB `totalCharged`. */
  total: number;
  /** Just the successful-PPOB-transaction component of `total`, broken out for reuse (e.g. recap's PPOB-share bars). */
  ppobRevenue: number;
}

/**
 * Total revenue for one calendar day: every sale's `total` (all tender
 * types, including `debit`) plus successful PPOB transactions'
 * `totalCharged`. Deliberately NOT `cashAmount + qrisAmount + ppob` — a
 * `debit`-tendered sale has both of those at 0 per
 * `assertTenderAmountsConsistent`'s bookkeeping rules, so that sum would
 * silently under-count debit revenue. Used for "today", the "yesterday"
 * comparator, and recap's weekly bars so every caller computes a day's
 * revenue identically. Exported for reuse outside this module.
 */
export async function dayRevenueTotal(
  merchantId: string,
  start: Date,
  end: Date,
  outletId?: string,
): Promise<DayRevenue> {
  const scope = outletId ? { outletId } : {};
  const [salesAgg, ppobAgg] = await Promise.all([
    prisma.sale.aggregate({
      where: { merchantId, ...scope, createdAt: { gte: start, lt: end } },
      _sum: { total: true },
    }),
    prisma.ppobTransaction.aggregate({
      where: { merchantId, ...scope, status: "success", createdAt: { gte: start, lt: end } },
      _sum: { totalCharged: true },
    }),
  ]);
  const ppobRevenue = ppobAgg._sum.totalCharged ?? 0;
  return { total: (salesAgg._sum.total ?? 0) + ppobRevenue, ppobRevenue };
}

/**
 * The day-summary arithmetic behind GET /api/sales/summary/today, generalized
 * to any calendar day so recap aggregation (Phase 6) can reuse it verbatim
 * for a `?date=` other than today instead of re-deriving the same rules.
 * `at`'s calendar day (server-local, see `getTodaySummary`'s note) is the
 * target day; "yesterday" is always the day immediately before it.
 *
 * `tenderMix` is a partial view: its Cash/QRIS/PPOB buckets are proportioned
 * against their own 3-bucket subtotal (not against the debit-inclusive
 * `total`), matching the prototype's own tender strip, which never modeled a
 * debit bucket either. It's fine for the three bars not to sum to `total`
 * on a day with debit sales — `total` itself is always the correct,
 * debit-inclusive figure.
 */
export async function getDaySummary(merchantId: string, at: Date, outletId?: string): Promise<TodaySummaryResponse> {
  const today = dayBounds(at);
  const yesterdayEnd = today.start;
  const yesterdayStart = new Date(yesterdayEnd);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const scope = outletId ? { outletId } : {};

  const [cashAgg, qrisAgg, salesTodayAgg, ppobTodayAgg, ppobCountToday, yesterdayTotal] = await Promise.all([
    prisma.sale.aggregate({
      where: { merchantId, ...scope, createdAt: { gte: today.start, lt: today.end } },
      _sum: { cashAmount: true },
    }),
    prisma.sale.aggregate({
      where: { merchantId, ...scope, createdAt: { gte: today.start, lt: today.end } },
      _sum: { qrisAmount: true },
    }),
    prisma.sale.aggregate({
      where: { merchantId, ...scope, createdAt: { gte: today.start, lt: today.end } },
      _sum: { total: true },
      _count: true,
    }),
    prisma.ppobTransaction.aggregate({
      where: { merchantId, ...scope, status: "success", createdAt: { gte: today.start, lt: today.end } },
      _sum: { totalCharged: true },
    }),
    prisma.ppobTransaction.count({
      where: { merchantId, ...scope, status: "success", createdAt: { gte: today.start, lt: today.end } },
    }),
    dayRevenueTotal(merchantId, yesterdayStart, yesterdayEnd, outletId),
  ]);

  const cashToday = cashAgg._sum.cashAmount ?? 0;
  const qrisToday = qrisAgg._sum.qrisAmount ?? 0;
  const ppobToday = ppobTodayAgg._sum.totalCharged ?? 0;
  const salesTotalToday = salesTodayAgg._sum.total ?? 0;

  const total = salesTotalToday + ppobToday;
  const count = salesTodayAgg._count + ppobCountToday;
  const avgTicket = count > 0 ? total / count : 0;
  const pctChangeVsYesterday =
    yesterdayTotal.total !== 0 ? ((total - yesterdayTotal.total) / yesterdayTotal.total) * 100 : 0;

  const tenderSubtotal = cashToday + qrisToday + ppobToday;
  const pct = (amount: number) => (tenderSubtotal > 0 ? (amount / tenderSubtotal) * 100 : 0);

  return {
    total,
    count,
    avgTicket,
    pctChangeVsYesterday,
    tenderMix: [
      { label: "Cash", amount: cashToday, pct: pct(cashToday) },
      { label: "QRIS", amount: qrisToday, pct: pct(qrisToday) },
      { label: "PPOB", amount: ppobToday, pct: pct(ppobToday) },
    ],
  };
}

/**
 * GET /api/sales/summary/today's data. "Today" is the server-local calendar
 * day — an acceptable simplification for now; genuinely honoring the
 * merchant's own local day would need a stored merchant timezone, which
 * doesn't exist in the schema yet.
 */
export async function getTodaySummary(merchantId: string, outletId?: string): Promise<TodaySummaryResponse> {
  return getDaySummary(merchantId, new Date(), outletId);
}
