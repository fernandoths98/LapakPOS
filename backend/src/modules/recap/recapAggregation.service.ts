import { TodaySummaryResponse } from "@lapak/shared";
import { prisma } from "../../db/prisma";
import { dayBounds, getDaySummary, resolveTimeZone } from "../sales/sales.service";
import { hourInTz, localDateKey } from "../../utils/time";
import { getCostIncreases, getLowStockWithSaleRate, SALE_RATE_WINDOW_DAYS } from "../home/salesInsights.queries";
import { getTopSellersForWindow } from "./topSellers.queries";

const TOP_SELLERS_LIMIT = 5;
const QUIET_HOUR_WINDOW_DAYS = 21; // trailing 3 weeks, within the "2-4 weeks" the spec asks for
/** A warung's typical opening hours — matches the prototype's own example window (an 18:00-20:00 "rush"). */
const OPENING_HOUR_START = 6;
const OPENING_HOUR_END_EXCLUSIVE = 22;

export interface AggTopSeller {
  name: string;
  qty: number;
  revenue: number;
}

export interface AggLowStockItem {
  name: string;
  stockQty: number;
  /** null when there isn't enough sale history to estimate this honestly (avoids Infinity/NaN). */
  daysOfCover: number | null;
}

export interface AggCostIncrease {
  name: string;
  oldCost: number;
  newCost: number;
  pctIncrease: number;
}

export interface AggQuietHour {
  /** e.g. "14:00–15:00" */
  label: string;
  avgRevenue: number;
}

/**
 * Compact, non-AI-generated business-intelligence context for one merchant +
 * calendar day. Every number here comes straight from SQL/Prisma — Claude's
 * only job downstream (recap.service.ts) is to turn this into readable prose
 * and pick out what's worth mentioning, never to invent figures.
 */
export interface RecapAggregationContext {
  recapDate: string;
  today: TodaySummaryResponse;
  topSellers: AggTopSeller[];
  lowStock: AggLowStockItem[];
  costIncreases: AggCostIncrease[];
  quietHour: AggQuietHour | null;
}

/** Top-5 products by quantity sold on the given calendar day. */
async function getTopSellers(merchantId: string, start: Date, end: Date): Promise<AggTopSeller[]> {
  const rows = await getTopSellersForWindow(merchantId, start, end, TOP_SELLERS_LIMIT);
  return rows.map((r) => ({ name: r.name, qty: r.qty, revenue: r.revenue }));
}

/**
 * Low-stock products with a rough days-of-cover estimate: `stockQty /
 * (soldInWindow / SALE_RATE_WINDOW_DAYS)`. When there's no sale history in
 * the window (divide-by-zero) the estimate is omitted (`null`) rather than
 * showing `Infinity`/`NaN` — the product is still listed as low-stock, just
 * without a cover estimate.
 */
async function getLowStockWithCover(merchantId: string): Promise<AggLowStockItem[]> {
  const rows = await getLowStockWithSaleRate(merchantId);
  return rows.map(({ product, soldInWindow }) => {
    const perDay = soldInWindow / SALE_RATE_WINDOW_DAYS;
    const daysOfCover = perDay > 0 ? product.stockQty / perDay : null;
    return {
      name: product.name,
      stockQty: product.stockQty,
      daysOfCover: daysOfCover !== null && Number.isFinite(daysOfCover) ? Math.round(daysOfCover) : null,
    };
  });
}

async function getRecentCostIncreases(merchantId: string): Promise<AggCostIncrease[]> {
  const rows = await getCostIncreases(merchantId);
  return rows.map((r) => ({
    name: r.product.name,
    oldCost: r.oldCost,
    newCost: r.newCost,
    pctIncrease: Math.round(r.pctIncrease),
  }));
}

/**
 * Finds the quietest hour-of-day during typical opening hours, by averaging
 * completed sales' revenue-per-calendar-day over the trailing
 * `QUIET_HOUR_WINDOW_DAYS` days, bucketed by hour-of-day. Fetches raw
 * (createdAt, total) rows and buckets in JS rather than a raw SQL
 * `EXTRACT(HOUR ...)` query — simplest correct approach at warung data
 * volumes, and keeps this Prisma-portable.
 *
 * Returns null when there's no sales history at all in the window (nothing
 * to compare), or when no opening-hour bucket has any sales (can't tell a
 * genuinely quiet hour from one where the shop simply wasn't recording data).
 */
async function getQuietHour(merchantId: string, timeZone: string): Promise<AggQuietHour | null> {
  const end = dayBounds(new Date(), timeZone).end; // through the end of today
  const start = new Date(end);
  start.setDate(start.getDate() - QUIET_HOUR_WINDOW_DAYS);

  const sales = await prisma.sale.findMany({
    where: { merchantId, status: "completed", createdAt: { gte: start, lt: end } },
    select: { createdAt: true, total: true },
  });
  if (sales.length === 0) return null;

  const revenueByHour = new Map<number, number>();
  const countByHour = new Map<number, number>();
  for (const sale of sales) {
    const hour = hourInTz(sale.createdAt, timeZone);
    revenueByHour.set(hour, (revenueByHour.get(hour) ?? 0) + sale.total);
    countByHour.set(hour, (countByHour.get(hour) ?? 0) + 1);
  }

  let quietest: { hour: number; avgRevenue: number } | null = null;
  for (let hour = OPENING_HOUR_START; hour < OPENING_HOUR_END_EXCLUSIVE; hour++) {
    if (!countByHour.has(hour)) continue; // no data for this hour — can't call it "quiet" honestly
    const avgRevenue = (revenueByHour.get(hour) ?? 0) / QUIET_HOUR_WINDOW_DAYS;
    if (!quietest || avgRevenue < quietest.avgRevenue) {
      quietest = { hour, avgRevenue };
    }
  }
  if (!quietest) return null;

  const label = `${String(quietest.hour).padStart(2, "0")}:00–${String(quietest.hour + 1).padStart(2, "0")}:00`;
  return { label, avgRevenue: Math.round(quietest.avgRevenue) };
}

/** Builds the full aggregation context for one merchant + calendar day. Pure SQL/Prisma — no AI call in here. */
export async function buildRecapAggregation(merchantId: string, date: Date): Promise<RecapAggregationContext> {
  const timeZone = await resolveTimeZone(merchantId);
  const { start, end } = dayBounds(date, timeZone);
  const [today, topSellers, lowStock, costIncreases, quietHour] = await Promise.all([
    getDaySummary(merchantId, date, undefined, timeZone),
    getTopSellers(merchantId, start, end),
    getLowStockWithCover(merchantId),
    getRecentCostIncreases(merchantId),
    getQuietHour(merchantId, timeZone),
  ]);

  const recapDate = localDateKey(date, timeZone);

  return { recapDate, today, topSellers, lowStock, costIncreases, quietHour };
}
