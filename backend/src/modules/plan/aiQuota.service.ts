import { AiFeature, entitlementsFor } from "@lapak/shared";
import { prisma } from "../../db/prisma";
import { getEffectivePlan, usageDay } from "./plan.service";

export interface QuotaOutcome {
  allowed: boolean;
  /** Calls left after this one. Null when the plan is unlimited. */
  remaining: number | null;
  limit: number | null;
}

/**
 * Claims one AI call for today, or refuses.
 *
 * The claim is a single conditional upsert rather than a read-then-write: two
 * requests arriving together would both read "4 of 5 used" and both proceed,
 * and since every one of these calls costs real Claude credit, the race is
 * worth closing properly. Postgres evaluates the `WHERE` on the conflict
 * branch, so exactly one of the two updates lands and the loser is refused.
 */
export async function consumeAiQuota(merchantId: string, feature: AiFeature): Promise<QuotaOutcome> {
  const plan = await getEffectivePlan(merchantId);
  const limit = entitlementsFor(plan).aiDailyLimits[feature];
  const day = usageDay();

  if (limit === null) {
    await prisma.$executeRaw`
      INSERT INTO ai_usage_days (id, merchant_id, day, feature, count)
      VALUES (gen_random_uuid(), ${merchantId}::uuid, ${day}::date, ${feature}::"AiFeature", 1)
      ON CONFLICT (merchant_id, day, feature)
      DO UPDATE SET count = ai_usage_days.count + 1
    `;
    return { allowed: true, remaining: null, limit: null };
  }

  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO ai_usage_days (id, merchant_id, day, feature, count)
    VALUES (gen_random_uuid(), ${merchantId}::uuid, ${day}::date, ${feature}::"AiFeature", 1)
    ON CONFLICT (merchant_id, day, feature)
    DO UPDATE SET count = ai_usage_days.count + 1
    WHERE ai_usage_days.count < ${limit}
    RETURNING count
  `;

  if (rows.length === 0) return { allowed: false, remaining: 0, limit };
  return { allowed: true, remaining: Math.max(0, limit - rows[0].count), limit };
}
