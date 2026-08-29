import { Entitlements, entitlementsFor, isUnlimited, PlanCode } from "@lapak/shared";
import { EntitlementsResponse } from "@lapak/shared";
import { SubscriptionStatus } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../utils/errors";

/** 402 Payment Required — the mobile app special-cases this to show an upgrade prompt. */
export function planLimit(message: string): AppError {
  return new AppError(402, "plan_limit", message);
}

interface ResolvedPlan {
  planCode: PlanCode;
  status: SubscriptionStatus;
  entitlements: Entitlements;
  currentPeriodEndsAt: Date | null;
  trialEndsAt: Date | null;
}

/**
 * The merchant's live plan + entitlements. A merchant with no subscription
 * row (shouldn't happen after Phase 2b, but be defensive) is treated as free.
 *
 * Expired trials are ended lazily here — on the first entitlement check after
 * `trialEndsAt` passes, the row flips `trialing -> canceled` (which
 * `entitlementsFor` reads as the free tier). Same read-repairs-state pattern
 * as `getInvoices` flipping `pending -> expired`; no scheduler needed, and
 * every guarded route calls `resolvePlan`, so it always self-heals.
 */
export async function resolvePlan(merchantId: string): Promise<ResolvedPlan> {
  const sub = await prisma.subscription.findUnique({ where: { merchantId } });
  const planCode = (sub?.planCode ?? "free") as PlanCode;
  let status = (sub?.status ?? "active") as SubscriptionStatus;

  if (sub && status === "trialing" && sub.trialEndsAt && sub.trialEndsAt.getTime() <= Date.now()) {
    status = "canceled";
    await prisma.subscription
      .updateMany({ where: { merchantId, status: "trialing" }, data: { status: "canceled" } })
      .catch(() => undefined);
  }

  return {
    planCode,
    status,
    entitlements: entitlementsFor(planCode, status),
    currentPeriodEndsAt: sub?.currentPeriodEndsAt ?? null,
    trialEndsAt: sub?.trialEndsAt ?? null,
  };
}

/** GET /api/subscription/entitlements — plan, caps, and current usage against them. */
export async function getEntitlements(merchantId: string): Promise<EntitlementsResponse> {
  const [plan, outlets, staff, products] = await Promise.all([
    resolvePlan(merchantId),
    prisma.outlet.count({ where: { merchantId } }),
    prisma.user.count({ where: { merchantId, isActive: true } }),
    prisma.product.count({ where: { merchantId, deletedAt: null } }),
  ]);
  return {
    planCode: plan.planCode,
    status: plan.status,
    entitlements: plan.entitlements,
    usage: { outlets, staff, products },
    currentPeriodEndsAt: plan.currentPeriodEndsAt?.toISOString() ?? null,
    trialEndsAt: plan.trialEndsAt?.toISOString() ?? null,
  };
}

type QuotaKind = "outlets" | "staff" | "products";

const QUOTA_CAP: Record<QuotaKind, keyof Entitlements> = {
  outlets: "maxOutlets",
  staff: "maxStaff",
  products: "maxProducts",
};

const QUOTA_LABEL: Record<QuotaKind, string> = {
  outlets: "outlet",
  staff: "akun staf",
  products: "produk",
};

/**
 * Throws a 402 when creating one more `kind` would exceed the plan's cap.
 * `adding` defaults to 1 (a single create); the importer passes a batch size.
 */
export async function assertWithinQuota(merchantId: string, kind: QuotaKind, adding = 1): Promise<void> {
  const plan = await resolvePlan(merchantId);
  const cap = plan.entitlements[QUOTA_CAP[kind]] as number;
  if (isUnlimited(cap)) return;

  const current =
    kind === "outlets"
      ? await prisma.outlet.count({ where: { merchantId } })
      : kind === "staff"
        ? await prisma.user.count({ where: { merchantId, isActive: true } })
        : await prisma.product.count({ where: { merchantId, deletedAt: null } });

  if (current + adding > cap) {
    throw planLimit(
      `Paket ${plan.planCode} dibatasi ${cap} ${QUOTA_LABEL[kind]}. Upgrade paket untuk menambah lagi.`,
    );
  }
}

const FEATURE_LABEL: Partial<Record<keyof Entitlements, string>> = {
  excelIO: "Impor/ekspor Excel",
  ai: "Fitur AI",
  multiOutlet: "Banyak outlet",
  franchise: "Sistem franchise",
};

/** Throws a 402 when the plan doesn't include a boolean feature flag. */
export async function requireFeature(merchantId: string, feature: keyof Entitlements): Promise<void> {
  const plan = await resolvePlan(merchantId);
  if (plan.entitlements[feature] === true) return;
  throw planLimit(`${FEATURE_LABEL[feature] ?? String(feature)} tidak tersedia di paket ${plan.planCode}. Upgrade untuk membukanya.`);
}
