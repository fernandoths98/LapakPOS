import { PLAN_ENTITLEMENTS, splitPpobMargin } from "@lapak/shared";
import { prisma } from "../../../db/prisma";
import { consumeAiQuota } from "../aiQuota.service";
import { effectivePlan, getPlan, usageDay } from "../plan.service";

const FREE_MERCHANT_ID = "00000000-0000-0000-0000-0000000000a0";
const PRO_MERCHANT_ID = "00000000-0000-0000-0000-0000000000a1";
const LAPSED_MERCHANT_ID = "00000000-0000-0000-0000-0000000000a2";

const HOUR = 60 * 60 * 1000;

async function resetUsage(merchantId: string): Promise<void> {
  await prisma.aiUsageDay.deleteMany({ where: { merchantId } });
}

describe("plan.service", () => {
  beforeAll(async () => {
    await prisma.merchant.upsert({
      where: { id: FREE_MERCHANT_ID },
      update: { plan: "free", planRenewsAt: null },
      create: { id: FREE_MERCHANT_ID, name: "Free Plan Merchant" },
    });
    await prisma.merchant.upsert({
      where: { id: PRO_MERCHANT_ID },
      update: { plan: "pro", planRenewsAt: new Date(Date.now() + 30 * 24 * HOUR) },
      create: {
        id: PRO_MERCHANT_ID,
        name: "Pro Plan Merchant",
        plan: "pro",
        planRenewsAt: new Date(Date.now() + 30 * 24 * HOUR),
      },
    });
    await prisma.merchant.upsert({
      where: { id: LAPSED_MERCHANT_ID },
      update: { plan: "pro", planRenewsAt: new Date(Date.now() - HOUR) },
      create: {
        id: LAPSED_MERCHANT_ID,
        name: "Lapsed Pro Merchant",
        plan: "pro",
        planRenewsAt: new Date(Date.now() - HOUR),
      },
    });
  });

  beforeEach(async () => {
    await Promise.all([FREE_MERCHANT_ID, PRO_MERCHANT_ID, LAPSED_MERCHANT_ID].map(resetUsage));
  });

  afterAll(async () => {
    await Promise.all([FREE_MERCHANT_ID, PRO_MERCHANT_ID, LAPSED_MERCHANT_ID].map(resetUsage));
    await prisma.$disconnect();
  });

  describe("effectivePlan", () => {
    it("treats a pro plan whose renewal date has passed as free, with no downgrade job involved", () => {
      const now = new Date("2026-09-08T00:00:00Z");
      expect(effectivePlan("pro", new Date("2026-09-07T23:59:59Z"), now)).toBe("free");
    });

    it("keeps a pro plan that has not reached its renewal date", () => {
      const now = new Date("2026-09-08T00:00:00Z");
      expect(effectivePlan("pro", new Date("2026-10-08T00:00:00Z"), now)).toBe("pro");
    });

    it("treats a pro plan with no renewal date as still active", () => {
      expect(effectivePlan("pro", null)).toBe("pro");
    });

    it("never upgrades a free plan, whatever the renewal date says", () => {
      expect(effectivePlan("free", new Date(Date.now() + 30 * 24 * HOUR))).toBe("free");
    });
  });

  describe("consumeAiQuota", () => {
    it("allows exactly the free plan's daily allowance and then refuses", async () => {
      const limit = PLAN_ENTITLEMENTS.free.aiDailyLimits.ask;
      if (limit === null) throw new Error("this test assumes the free ask limit is finite");

      const outcomes = [];
      for (let i = 0; i < limit; i++) {
        outcomes.push(await consumeAiQuota(FREE_MERCHANT_ID, "ask"));
      }
      expect(outcomes.every((o) => o.allowed)).toBe(true);
      expect(outcomes[outcomes.length - 1].remaining).toBe(0);

      const overflow = await consumeAiQuota(FREE_MERCHANT_ID, "ask");
      expect(overflow.allowed).toBe(false);
      expect(overflow.remaining).toBe(0);
    });

    it("does not let concurrent calls overspend the allowance", async () => {
      const limit = PLAN_ENTITLEMENTS.free.aiDailyLimits.ask;
      if (limit === null) throw new Error("this test assumes the free ask limit is finite");

      // Fired together so they race on the same row: a read-then-write
      // implementation lets more than `limit` through here.
      const results = await Promise.all(
        Array.from({ length: limit + 5 }, () => consumeAiQuota(FREE_MERCHANT_ID, "ask")),
      );
      expect(results.filter((r) => r.allowed)).toHaveLength(limit);
    });

    it("meters each feature separately", async () => {
      await consumeAiQuota(FREE_MERCHANT_ID, "recap");
      expect((await consumeAiQuota(FREE_MERCHANT_ID, "recap")).allowed).toBe(false);
      expect((await consumeAiQuota(FREE_MERCHANT_ID, "ask")).allowed).toBe(true);
    });

    it("never refuses a pro merchant, and reports unlimited rather than a number", async () => {
      const results = [];
      for (let i = 0; i < 10; i++) {
        results.push(await consumeAiQuota(PRO_MERCHANT_ID, "recap"));
      }
      expect(results.every((r) => r.allowed)).toBe(true);
      expect(results[0].remaining).toBeNull();
      expect(results[0].limit).toBeNull();
    });

    it("applies free limits to a merchant whose pro plan has lapsed", async () => {
      await consumeAiQuota(LAPSED_MERCHANT_ID, "recap");
      expect((await consumeAiQuota(LAPSED_MERCHANT_ID, "recap")).allowed).toBe(false);
    });

    it("starts a fresh allowance on a new day rather than carrying yesterday's count", async () => {
      const yesterday = new Date(usageDay().getTime() - 24 * HOUR);
      await prisma.aiUsageDay.create({
        data: { merchantId: FREE_MERCHANT_ID, day: yesterday, feature: "recap", count: 99 },
      });
      expect((await consumeAiQuota(FREE_MERCHANT_ID, "recap")).allowed).toBe(true);
    });
  });

  describe("getPlan", () => {
    it("reports the free plan with its usage standing, counting only what was spent", async () => {
      await consumeAiQuota(FREE_MERCHANT_ID, "ask");
      const plan = await getPlan(FREE_MERCHANT_ID);

      expect(plan.plan).toBe("free");
      expect(plan.planRenewsAt).toBeNull();
      expect(plan.entitlements.showsAds).toBe(true);

      const ask = plan.aiUsageToday.find((u) => u.feature === "ask");
      expect(ask).toMatchObject({ used: 1, limit: PLAN_ENTITLEMENTS.free.aiDailyLimits.ask });
      expect(ask?.remaining).toBe((PLAN_ENTITLEMENTS.free.aiDailyLimits.ask ?? 0) - 1);

      // Untouched features still report a full allowance, not a missing row.
      expect(plan.aiUsageToday.find((u) => u.feature === "photoFill")?.used).toBe(0);
    });

    it("reports a lapsed pro merchant as free and stops advertising a renewal date", async () => {
      const plan = await getPlan(LAPSED_MERCHANT_ID);
      expect(plan.plan).toBe("free");
      expect(plan.planRenewsAt).toBeNull();
    });

    it("reports pro with unlimited AI and no ads", async () => {
      const plan = await getPlan(PRO_MERCHANT_ID);
      expect(plan.plan).toBe("pro");
      expect(plan.planRenewsAt).not.toBeNull();
      expect(plan.entitlements.showsAds).toBe(false);
      expect(plan.aiUsageToday.every((u) => u.limit === null && u.remaining === null)).toBe(true);
    });
  });

  describe("splitPpobMargin", () => {
    it("gives a pro merchant the whole markup", () => {
      expect(splitPpobMargin(2500, "pro")).toEqual({ merchantCommission: 2500, platformFee: 0 });
    });

    it("takes Lapak's cut from a free merchant's markup", () => {
      expect(splitPpobMargin(2500, "free")).toEqual({ merchantCommission: 1750, platformFee: 750 });
    });

    it("always sums the two parts back to the original markup, with no stray rupiah", () => {
      for (const margin of [0, 1, 3, 7, 999, 1234, 2501]) {
        const { merchantCommission, platformFee } = splitPpobMargin(margin, "free");
        expect(merchantCommission + platformFee).toBe(margin);
        expect(Number.isInteger(merchantCommission)).toBe(true);
        expect(Number.isInteger(platformFee)).toBe(true);
      }
    });

    it("rounds in Lapak's favour rather than inventing a rupiah for the merchant", () => {
      // 0.7 * 3 = 2.1 — the merchant gets 2, never 3.
      expect(splitPpobMargin(3, "free").merchantCommission).toBe(2);
    });
  });
});
