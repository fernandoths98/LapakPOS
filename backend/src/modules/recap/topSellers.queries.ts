import { prisma } from "../../db/prisma";

export interface TopSellerRow {
  productId: string;
  name: string;
  qty: number;
  /** Sum of `lineTotal` across the window — actual sale revenue, not list price × qty. */
  revenue: number;
  /** The product's CURRENT `costPrice` — see recap.service.ts's weekly-margin note for the simplification this implies. */
  costPrice: number;
}

/**
 * Top products by quantity sold within [start, end), shared by both the
 * daily recap aggregation (Story tab) and the weekly reports (Reports tab)
 * so the grouping query and product-name/cost lookup only exist once.
 */
export async function getTopSellersForWindow(
  merchantId: string,
  start: Date,
  end: Date,
  limit: number,
): Promise<TopSellerRow[]> {
  const rows = await prisma.saleLineItem.groupBy({
    by: ["productId"],
    where: { sale: { merchantId, createdAt: { gte: start, lt: end } } },
    _sum: { qty: true, lineTotal: true },
    orderBy: { _sum: { qty: "desc" } },
    take: limit,
  });
  if (rows.length === 0) return [];

  const products = await prisma.product.findMany({ where: { id: { in: rows.map((r) => r.productId) } } });
  const byId = new Map(products.map((p) => [p.id, p]));

  return rows.map((r) => {
    const product = byId.get(r.productId);
    return {
      productId: r.productId,
      name: product?.name ?? "Unknown product",
      qty: r._sum.qty ?? 0,
      revenue: r._sum.lineTotal ?? 0,
      costPrice: product?.costPrice ?? 0,
    };
  });
}
