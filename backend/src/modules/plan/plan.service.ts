import {
  AI_FEATURES,
  AiFeature,
  AiUsageToday,
  MerchantPlan,
  PlanResponse,
  entitlementsFor,
} from "@lapak/shared";
import { prisma } from "../../db/prisma";
import { notFound } from "../../utils/errors";

/**
 * A merchant's plan is whatever they paid for *until it lapses*. Rather than
 * running a downgrade job that could fall behind, the effective plan is
 * derived on every read: a `pro` row whose `planRenewsAt` is in the past is
 * simply free from that instant, so a lapsed subscription can never keep
 * handing out entitlements just because no cron ran.
 */
export function effectivePlan(plan: MerchantPlan, planRenewsAt: Date | null, now = new Date()): MerchantPlan {
  if (plan !== "pro") return "free";
  if (planRenewsAt && planRenewsAt.getTime() <= now.getTime()) return "free";
  return "pro";
}

export async function getEffectivePlan(merchantId: string): Promise<MerchantPlan> {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { plan: true, planRenewsAt: true },
  });
  if (!merchant) throw notFound("Merchant");
  return effectivePlan(merchant.plan, merchant.planRenewsAt);
}

/**
 * Midnight UTC of the current day, which is what the `@db.Date` column stores.
 * Indonesia spans UTC+7..+9, so a merchant's quota rolls over during their
 * morning rather than at their local midnight. That is a deliberate
 * simplification while every merchant is on one plan shape; per-merchant
 * timezones belong with the merchant-settings screen that does not exist yet.
 */
export function usageDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function getAiUsageToday(merchantId: string, plan: MerchantPlan): Promise<AiUsageToday[]> {
  const rows = await prisma.aiUsageDay.findMany({
    where: { merchantId, day: usageDay() },
    select: { feature: true, count: true },
  });
  const used = new Map(rows.map((r) => [r.feature as AiFeature, r.count]));
  const limits = entitlementsFor(plan).aiDailyLimits;

  return AI_FEATURES.map((feature) => {
    const count = used.get(feature) ?? 0;
    const limit = limits[feature];
    return {
      feature,
      used: count,
      limit,
      remaining: limit === null ? null : Math.max(0, limit - count),
    };
  });
}

export async function getPlan(merchantId: string): Promise<PlanResponse> {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { plan: true, planRenewsAt: true },
  });
  if (!merchant) throw notFound("Merchant");

  const plan = effectivePlan(merchant.plan, merchant.planRenewsAt);
  return {
    plan,
    planRenewsAt: plan === "pro" && merchant.planRenewsAt ? merchant.planRenewsAt.toISOString() : null,
    entitlements: entitlementsFor(plan),
    aiUsageToday: await getAiUsageToday(merchantId, plan),
  };
}
