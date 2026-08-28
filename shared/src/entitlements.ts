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
 * window while a renewal payment is chased).
 */
export function entitlementsFor(planCode: PlanCode, status: SubscriptionStatus | string): Entitlements {
  if (status === "canceled") return PLAN_ENTITLEMENTS.free;
  return PLAN_ENTITLEMENTS[planCode as PlanCode] ?? PLAN_ENTITLEMENTS.free;
}

export function isUnlimited(cap: number): boolean {
  return cap >= ENTITLEMENT_UNLIMITED;
}
