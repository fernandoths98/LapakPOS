import { AiFeature } from "@prisma/client";
import { isUnlimited } from "@lapak/shared";
import { prisma } from "../../db/prisma";
import { planLimit, resolvePlan } from "./entitlements.service";

/**
 * Midnight UTC of the current day, matching the `@db.Date` column.
 *
 * Indonesia spans UTC+7..+9, so the allowance rolls over during a merchant's
 * morning rather than at their local midnight. Deliberate for now: outlets
 * already carry a `timezone`, so when this needs to follow the outlet's day
 * it has somewhere real to read it from.
 */
export function usageDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Claims one AI call against today's allowance, or throws the same 402 the
 * rest of the plan gates use so the app's existing upgrade prompt handles it.
 *
 * Call this *after* `requireFeature(merchantId, "ai")`: that answers "does
 * this plan have AI at all", this answers "is there budget left today".
 *
 * The claim is one conditional upsert rather than a read-then-write. Two
 * requests arriving together would both read "49 of 50 used" and both
 * proceed, and every one of these calls spends real Claude credit, so the
 * race is worth closing properly — Postgres evaluates the `WHERE` on the
 * conflict branch, so exactly one of the two updates lands.
 */
export async function consumeAiQuota(merchantId: string, feature: AiFeature): Promise<void> {
  const plan = await resolvePlan(merchantId);
  const limit = plan.entitlements.aiDailyCalls;
  const day = usageDay();

  if (isUnlimited(limit)) {
    await prisma.$executeRaw`
      INSERT INTO ai_usage_days (id, merchant_id, day, feature, count)
      VALUES (gen_random_uuid(), ${merchantId}::uuid, ${day}::date, ${feature}::"AiFeature", 1)
      ON CONFLICT (merchant_id, day, feature)
      DO UPDATE SET count = ai_usage_days.count + 1
    `;
    return;
  }

  const claimed = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO ai_usage_days (id, merchant_id, day, feature, count)
    VALUES (gen_random_uuid(), ${merchantId}::uuid, ${day}::date, ${feature}::"AiFeature", 1)
    ON CONFLICT (merchant_id, day, feature)
    DO UPDATE SET count = ai_usage_days.count + 1
    WHERE ai_usage_days.count < ${limit}
    RETURNING count
  `;

  if (claimed.length === 0) {
    throw planLimit(
      `Jatah harian fitur AI ini di paket ${plan.planCode} (${limit} panggilan) sudah habis. ` +
        "Coba lagi besok, atau upgrade paket.",
    );
  }
}

/** Today's spend per feature — for the entitlements response and support questions. */
export async function getAiUsageToday(merchantId: string): Promise<Record<AiFeature, number>> {
  const rows = await prisma.aiUsageDay.findMany({
    where: { merchantId, day: usageDay() },
    select: { feature: true, count: true },
  });
  const usage = { recap: 0, ask: 0, photoFill: 0 } as Record<AiFeature, number>;
  for (const row of rows) usage[row.feature] = row.count;
  return usage;
}
