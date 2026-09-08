import { PlanCode, SubscriptionStatus } from "./constants";

/**
 * What a merchant's current plan lets them do. Numeric caps use
 * `ENTITLEMENT_UNLIMITED` as the "no limit" sentinel (a large finite number,
 * so plain `<` / `>=` comparisons work without special-casing Infinity).
 *
 * This is the single source of truth for both backend enforcement and the
 * mobile app's feature gates — change a number here and both sides move.
 */
export interface Entitlements {
  /** Max number of outlets (branches). */
  maxOutlets: number;
  /** Max staff accounts, owner included. */
  maxStaff: number;
  /** Max active (non-deleted) products in the catalog. */
  maxProducts: number;
  /** How many days back reports/history are visible. */
  reportHistoryDays: number;
  /** Excel catalog import + the Excel exports. */
  excelIO: boolean;
  /** AI daily recap, AI "ask", and snap-to-fill. */
  ai: boolean;
  /**
   * Claude calls allowed per merchant per day, counted separately for each AI
   * surface (recap, ask, photo-fill) rather than as one shared pool — so a
   * busy afternoon on the assistant can never leave the merchant unable to
   * scan a product label.
   *
   * `ai` says whether the feature exists on the plan at all; this says how
   * hard it can be leaned on. Without it a plan with `ai: true` is unmetered
   * Claude spend — one merchant looping the assistant can cost more in a day
   * than their subscription brings in a month. Set well above ordinary use:
   * this is a ceiling on runaway cost, not a budget a warung should ever feel.
   * Zero wherever `ai` is false, so the two never disagree.
   */
  aiDailyCalls: number;
  /**
   * The fraction of their own PPOB markup the merchant keeps, 0..1. The rest
   * is Lapak's platform fee, written to the commission ledger beside the
   * merchant's share rather than quietly netted off — a merchant can always
   * see exactly what was taken, and it rises as they move up plans.
   */
  ppobMerchantShare: number;
  /** More than one outlet, and the outlet switcher UI. */
  multiOutlet: boolean;
  /** Franchise agreements + royalty statements. */
  franchise: boolean;
}

export const ENTITLEMENT_UNLIMITED = 1_000_000;
const U = ENTITLEMENT_UNLIMITED;

/**
 * Free is "free forever, limited" — every feature is present but capped, so a
 * single tiny warung runs the whole business at no cost and only pays once it
 * grows (more SKUs, more staff, more outlets, wants history/AI/import).
 */
export const PLAN_ENTITLEMENTS: Record<PlanCode, Entitlements> = {
  free: {
    maxOutlets: 1,
    maxStaff: 1,
    maxProducts: 50,
    reportHistoryDays: 7,
    excelIO: false,
    ai: false,
    multiOutlet: false,
    aiDailyCalls: 0,
    ppobMerchantShare: 0.7,
    franchise: false,
  },
  starter: {
    maxOutlets: 1,
    maxStaff: 5,
    maxProducts: U,
    reportHistoryDays: 90,
    excelIO: true,
    ai: false,
    multiOutlet: false,
    aiDailyCalls: 0,
    ppobMerchantShare: 0.8,
    franchise: false,
  },
  growth: {
    maxOutlets: 3,
    maxStaff: U,
    maxProducts: U,
    reportHistoryDays: 730,
    excelIO: true,
    ai: true,
    multiOutlet: true,
    aiDailyCalls: 50,
    ppobMerchantShare: 0.9,
    franchise: false,
  },
  pro: {
    maxOutlets: U,
    maxStaff: U,
    maxProducts: U,
    reportHistoryDays: 3650,
    excelIO: true,
    ai: true,
    multiOutlet: true,
    aiDailyCalls: 200,
    ppobMerchantShare: 1,
    franchise: true,
  },
};

export interface PlanInfo {
  code: PlanCode;
  name: string;
  /** Whole rupiah per month. 0 for free. */
  monthlyPrice: number;
  /** One-line pitch for the plan picker. */
  tagline: string;
  entitlements: Entitlements;
}

export const PLANS: PlanInfo[] = [
  { code: "free", name: "Gratis", monthlyPrice: 0, tagline: "Kasir dasar buat satu warung", entitlements: PLAN_ENTITLEMENTS.free },
  { code: "starter", name: "Starter", monthlyPrice: 49_000, tagline: "Katalog tanpa batas + Excel + 5 staf", entitlements: PLAN_ENTITLEMENTS.starter },
  { code: "growth", name: "Growth", monthlyPrice: 99_000, tagline: "3 outlet, staf tanpa batas, fitur AI", entitlements: PLAN_ENTITLEMENTS.growth },
  { code: "pro", name: "Pro", monthlyPrice: 199_000, tagline: "Outlet tanpa batas + sistem franchise", entitlements: PLAN_ENTITLEMENTS.pro },
];

export const PLAN_BY_CODE: Record<PlanCode, PlanInfo> = Object.fromEntries(
  PLANS.map((p) => [p.code, p]),
) as Record<PlanCode, PlanInfo>;

/**
 * The entitlements a merchant actually has right now. A `canceled`
 * subscription drops to the free tier — the business keeps operating, just
 * without the paid caps lifted. `past_due` keeps the plan (a short grace
 * window while a renewal payment is chased). `trialing` gets the full plan
 * it's trialing until the backend flips it to `canceled` at `trialEndsAt`.
 */
export function entitlementsFor(planCode: PlanCode, status: SubscriptionStatus | string): Entitlements {
  if (status === "canceled") return PLAN_ENTITLEMENTS.free;
  return PLAN_ENTITLEMENTS[planCode as PlanCode] ?? PLAN_ENTITLEMENTS.free;
}

export function isUnlimited(cap: number): boolean {
  return cap >= ENTITLEMENT_UNLIMITED;
}

/** A fresh signup gets this many days of `TRIAL_PLAN_CODE` before dropping to free. */
export const TRIAL_DAYS = 14;
export const TRIAL_PLAN_CODE: PlanCode = "starter";

/**
 * Whole days left on a trial, rounded up, floored at 0. `null`/undefined or
 * an already-past date both give 0. Shared so the backend, the register
 * screen's copy, and the Home trial banner all count the same way.
 */
export function trialDaysLeft(trialEndsAt: string | Date | null | undefined, now: Date = new Date()): number {
  if (!trialEndsAt) return 0;
  const end = typeof trialEndsAt === "string" ? new Date(trialEndsAt) : trialEndsAt;
  const ms = end.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

/**
 * Splits a PPOB markup into what the merchant banks and what Lapak keeps.
 * The merchant's share rounds down to the whole rupiah so the two parts always
 * sum back to the original margin — no half-rupiah can appear or vanish
 * between the ledger and the drawer.
 */
export function splitPpobMargin(
  marginAmount: number,
  planCode: PlanCode,
): { merchantCommission: number; platformFee: number } {
  const merchantCommission = Math.floor(marginAmount * PLAN_ENTITLEMENTS[planCode].ppobMerchantShare);
  return { merchantCommission, platformFee: marginAmount - merchantCommission };
}
