import { formatRupiah, HomeAlert, HomeAlertsResponse } from "@lapak/shared";
import { getCostIncreases, getLowStockWithSaleRate, SALE_RATE_WINDOW_DAYS } from "./salesInsights.queries";

const MAX_ALERTS = 5;

interface RankedAlert {
  alert: HomeAlert;
  /** Higher = more urgent, used only to order/cap within its own kind. */
  severity: number;
}

/**
 * Low-stock alerts, formatted from `getLowStockWithSaleRate`'s raw
 * product + trailing-14-day-sold-quantity pairs. Where the sale rate rounds
 * to at least 1/day the text is enriched with "you sell about N a day"; a
 * rate that rounds to 0 is left off rather than showing a misleading
 * "about 0 a day".
 */
async function lowStockAlerts(merchantId: string): Promise<RankedAlert[]> {
  const rows = await getLowStockWithSaleRate(merchantId);
  return rows.map(({ product, soldInWindow }) => {
    const roundedPerDay = Math.round(soldInWindow / SALE_RATE_WINDOW_DAYS);
    const rateClause = roundedPerDay >= 1 ? `, you sell about ${roundedPerDay} a day` : "";
    return {
      alert: { text: `${product.name} — ${product.stockQty} left${rateClause}.`, meta: "Reorder soon" },
      severity: -product.stockQty, // fewer left = higher severity
    };
  });
}

/**
 * Cost-increase alerts, formatted from `getCostIncreases`'s raw rows. The
 * suggested price preserves the margin percentage the product had BEFORE
 * this cost increase (derived from `oldCost` against the live sell price —
 * sell price is assumed unchanged since the cost bump, since nothing else
 * has touched it), applied to the new cost:
 * `oldMarginPct = (sellPrice - oldCost) / sellPrice`,
 * `suggestedPrice = newCost / (1 - oldMarginPct)`. Using the CURRENT cost
 * here instead would be a tautology — since the live product row already
 * reflects `newCost`, deriving "current margin" from it and re-applying that
 * margin to `newCost` always just returns the unchanged sell price, which is
 * not a suggestion at all. If the margin isn't a sane number (sell price 0,
 * old cost >= sell price, or the derived price isn't finite), the suggestion
 * clause is skipped rather than showing a fabricated figure — only the
 * "cost rose N%" fact is shown.
 */
async function costIncreaseAlerts(merchantId: string): Promise<RankedAlert[]> {
  const rows = await getCostIncreases(merchantId);
  return rows.map((row) => {
    const product = row.product;
    const oldMarginPct = product.sellPrice > 0 ? (product.sellPrice - row.oldCost) / product.sellPrice : NaN;
    let meta = "Review pricing";
    if (oldMarginPct > 0 && oldMarginPct < 1) {
      const suggestedPrice = row.newCost / (1 - oldMarginPct);
      if (Number.isFinite(suggestedPrice) && suggestedPrice > 0) {
        meta = `Suggested price ${formatRupiah(Math.round(suggestedPrice / 100) * 100)}`;
      }
    }
    return {
      alert: { text: `${product.name} cost rose ${Math.round(row.pctIncrease)}% this month.`, meta },
      severity: row.pctIncrease,
    };
  });
}

/**
 * GET /api/home/alerts — rule-based "needs attention" items, never AI or
 * hardcoded. Low-stock items are listed first (an empty shelf loses a sale
 * today), then cost increases, each group already sorted most-urgent first;
 * the combined list is capped so a catalog with many low-stock items doesn't
 * flood Home. An "offline sales queued" alert type (the prototype's third
 * example) is intentionally not built — it needs Phase 8's local sync queue,
 * which doesn't exist yet.
 */
export async function getHomeAlerts(merchantId: string): Promise<HomeAlertsResponse> {
  const [lowStock, costIncreases] = await Promise.all([lowStockAlerts(merchantId), costIncreaseAlerts(merchantId)]);
  const combined = [...lowStock, ...costIncreases].slice(0, MAX_ALERTS);
  return { alerts: combined.map((c) => c.alert) };
}
