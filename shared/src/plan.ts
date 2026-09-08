/**
 * What a merchant gets on each plan, in one place because both sides need it:
 * the backend enforces these numbers and the app explains them. Splitting them
 * would guarantee the paywall and the copy describing it eventually disagree.
 *
 * The shape of the free tier is deliberate. Selling is never metered — not by
 * transaction, product, or receipt — because a warung that has to ration
 * rings-ups will go back to a notebook, and a POS nobody rings up on is worth
 * nothing to us either. What is metered is what actually costs us money per
 * use (AI calls) or what only a shop with staff and money needs (more than one
 * cashier). Ads and a smaller cut of PPOB margin carry the rest.
 */

export type MerchantPlan = "free" | "pro";

/** The four surfaces that spend real Claude API credit. */
export type AiFeature = "recap" | "ask" | "discrepancy" | "photoFill";

export const AI_FEATURES: AiFeature[] = ["recap", "ask", "discrepancy", "photoFill"];

/** `null` means unlimited, everywhere it appears. */
export interface PlanEntitlements {
  /**
   * Cashier seats. Stated here because the upgrade screen compares plans on
   * it, but nothing enforces it yet: the backend has no create-user path to
   * guard — only login — so enforcement lands with the staff-management
   * screen. Until then this is a published number, not a limit.
   */
  maxUsers: number | null;
  aiDailyLimits: Record<AiFeature, number | null>;
  showsAds: boolean;
  /**
   * The fraction of their own PPOB markup the merchant keeps. The remainder is
   * Lapak's platform fee, which is written to the commission ledger next to the
   * merchant's share rather than quietly deducted — a merchant can always see
   * exactly what was taken.
   */
  ppobMerchantShare: number;
}

export const PLAN_ENTITLEMENTS: Record<MerchantPlan, PlanEntitlements> = {
  free: {
    maxUsers: 1,
    aiDailyLimits: { recap: 1, ask: 5, discrepancy: 1, photoFill: 3 },
    showsAds: true,
    ppobMerchantShare: 0.7,
  },
  pro: {
    maxUsers: null,
    aiDailyLimits: { recap: null, ask: null, discrepancy: null, photoFill: null },
    showsAds: false,
    ppobMerchantShare: 1,
  },
};

/**
 * Priced against what a kelontong actually clears in a day, not against
 * Western SaaS. The yearly rate is ten months for twelve — annual prepay is
 * normal in this market and it is the cheapest churn we will ever buy.
 */
export const PRO_PRICE_IDR = { monthly: 29_000, yearly: 290_000 } as const;

export function entitlementsFor(plan: MerchantPlan): PlanEntitlements {
  return PLAN_ENTITLEMENTS[plan];
}

/**
 * Splits a PPOB markup into what the merchant banks and what Lapak keeps.
 * The merchant's share is rounded down to the whole rupiah so the two parts
 * always sum back to the original margin — no half-rupiah can appear or
 * vanish between the ledger and the drawer.
 */
export function splitPpobMargin(marginAmount: number, plan: MerchantPlan): {
  merchantCommission: number;
  platformFee: number;
} {
  const merchantCommission = Math.floor(marginAmount * PLAN_ENTITLEMENTS[plan].ppobMerchantShare);
  return { merchantCommission, platformFee: marginAmount - merchantCommission };
}
