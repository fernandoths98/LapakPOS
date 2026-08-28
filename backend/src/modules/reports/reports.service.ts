import { OutletReportRow, OutletReportsResponse } from "@lapak/shared";
import { prisma } from "../../db/prisma";
import { resolvePlan } from "../subscription/entitlements.service";

/**
 * GET /api/reports/outlets — one row per outlet for the trailing `days`
 * (clamped to the plan's report-history limit): revenue, transaction count,
 * average ticket, low-stock SKU count, and whether a shift is open right now.
 * A single-outlet merchant just sees one row.
 */
export async function getOutletReports(merchantId: string, requestedDays: number): Promise<OutletReportsResponse> {
  const plan = await resolvePlan(merchantId);
  const days = Math.max(1, Math.min(requestedDays, plan.entitlements.reportHistoryDays));
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);

  const outlets = await prisma.outlet.findMany({
    where: { merchantId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });

  const rows: OutletReportRow[] = await Promise.all(
    outlets.map(async (outlet): Promise<OutletReportRow> => {
      const [sales, lowStock, openShift] = await Promise.all([
        prisma.sale.aggregate({
          where: { merchantId, outletId: outlet.id, createdAt: { gte: from, lt: to } },
          _sum: { total: true },
          _count: true,
        }),
        prisma.$queryRaw<Array<{ n: bigint }>>`
          SELECT count(*)::int AS n FROM "outlet_products"
          WHERE "outlet_id" = ${outlet.id} AND "deleted_at" IS NULL
            AND "stock_qty" <= "low_stock_threshold"`,
        prisma.shift.findFirst({ where: { merchantId, outletId: outlet.id, status: "open" }, select: { id: true } }),
      ]);
      const revenue = sales._sum.total ?? 0;
      const txnCount = sales._count;
      return {
        outletId: outlet.id,
        outletName: outlet.name,
        outletCode: outlet.code,
        type: outlet.type,
        isActive: outlet.isActive,
        revenue,
        txnCount,
        avgTicket: txnCount > 0 ? Math.round(revenue / txnCount) : 0,
        lowStockCount: Number(lowStock[0]?.n ?? 0),
        openShift: !!openShift,
      };
    }),
  );

  return {
    days,
    from: from.toISOString(),
    to: to.toISOString(),
    rows,
    totals: {
      revenue: rows.reduce((s, r) => s + r.revenue, 0),
      txnCount: rows.reduce((s, r) => s + r.txnCount, 0),
    },
  };
}
