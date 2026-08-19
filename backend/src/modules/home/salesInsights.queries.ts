import { Product } from "@prisma/client";
import { prisma } from "../../db/prisma";

/**
 * Shared raw-data queries behind Home's rule-based "needs attention" alerts
 * AND Recap's aggregation context (Phase 6) — both need the same underlying
 * facts (which products are low, which costs jumped recently) but format
 * them differently, so the Prisma queries and thresholds live here once and
 * each caller does its own presentation on top.
 */

export const SALE_RATE_WINDOW_DAYS = 14;
export const COST_HISTORY_WINDOW_DAYS = 30;
export const COST_INCREASE_THRESHOLD_PCT = 5;

export interface LowStockWithRate {
  product: Product;
  /** Units of this product sold over the trailing `SALE_RATE_WINDOW_DAYS` days. */
  soldInWindow: number;
}

/**
 * Every non-deleted product whose stockQty has dropped to or below its own
 * lowStockThreshold, sorted fewest-left-first, each paired with how many
 * units sold over the trailing 14 days (0 if none / no history).
 */
export async function getLowStockWithSaleRate(merchantId: string): Promise<LowStockWithRate[]> {
  const products = await prisma.product.findMany({ where: { merchantId, deletedAt: null } });
  const low = products.filter((p) => p.stockQty <= p.lowStockThreshold);
  if (low.length === 0) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - SALE_RATE_WINDOW_DAYS);

  const rateRows = await prisma.saleLineItem.groupBy({
    by: ["productId"],
    where: {
      productId: { in: low.map((p) => p.id) },
      sale: { merchantId, createdAt: { gte: cutoff } },
    },
    _sum: { qty: true },
  });
  const soldByProduct = new Map(rateRows.map((r) => [r.productId, r._sum.qty ?? 0]));

  return low
    .sort((a, b) => a.stockQty - b.stockQty) // fewest left first — most urgent
    .map((product) => ({ product, soldInWindow: soldByProduct.get(product.id) ?? 0 }));
}

export interface CostIncreaseRow {
  product: Product;
  oldCost: number;
  newCost: number;
  /** (newCost - oldCost) / oldCost * 100 */
  pctIncrease: number;
  changedAt: Date;
}

/**
 * `ProductCostHistory` rows from the trailing 30 days where `newCost` is at
 * least `COST_INCREASE_THRESHOLD_PCT` above `oldCost`, one row per product
 * (the single largest jump if several fall in the window), sorted by
 * pctIncrease descending. Rows with a zero/negative `oldCost` are skipped —
 * no meaningful percentage can be derived from a free/zero-cost baseline.
 */
export async function getCostIncreases(merchantId: string): Promise<CostIncreaseRow[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - COST_HISTORY_WINDOW_DAYS);

  const rows = await prisma.productCostHistory.findMany({
    where: { changedAt: { gte: cutoff }, product: { merchantId, deletedAt: null } },
    include: { product: true },
    orderBy: { changedAt: "desc" },
  });

  const byProduct = new Map<string, CostIncreaseRow>();
  for (const row of rows) {
    if (row.oldCost <= 0) continue;
    const pctIncrease = ((row.newCost - row.oldCost) / row.oldCost) * 100;
    if (pctIncrease < COST_INCREASE_THRESHOLD_PCT) continue;

    const existing = byProduct.get(row.productId);
    if (existing && existing.pctIncrease >= pctIncrease) continue; // keep only the largest jump per product

    byProduct.set(row.productId, {
      product: row.product,
      oldCost: row.oldCost,
      newCost: row.newCost,
      pctIncrease,
      changedAt: row.changedAt,
    });
  }

  return [...byProduct.values()].sort((a, b) => b.pctIncrease - a.pctIncrease);
}
