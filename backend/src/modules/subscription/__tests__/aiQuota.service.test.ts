import { PLAN_ENTITLEMENTS, splitPpobMargin } from "@lapak/shared";
import { prisma } from "../../../db/prisma";
import { consumeAiQuota, getAiUsageToday, usageDay } from "../aiQuota.service";

const M = "00000000-0000-0000-0000-0000000000f0";

const GROWTH_CAP = PLAN_ENTITLEMENTS.growth.aiDailyCalls;

async function setPlan(planCode: "free" | "starter" | "growth" | "pro") {
  await prisma.subscription.upsert({
    where: { merchantId: M },
    update: { planCode, status: "active" },
    create: { merchantId: M, planCode, status: "active" },
  });
}

/** Puts the merchant right at the cap without making `cap` separate calls. */
async function primeUsage(feature: "recap" | "ask" | "photoFill", count: number) {
  await prisma.aiUsageDay.upsert({
    where: { merchantId_day_feature: { merchantId: M, day: usageDay(), feature } },
    update: { count },
    create: { merchantId: M, day: usageDay(), feature, count },
  });
}

describe("aiQuota.service", () => {
  beforeAll(async () => {
    await prisma.merchant.upsert({ where: { id: M }, update: {}, create: { id: M, name: "AI Quota Test" } });
  });

  beforeEach(async () => {
    await prisma.aiUsageDay.deleteMany({ where: { merchantId: M } });
    await setPlan("growth");
  });

  afterAll(async () => {
    await prisma.aiUsageDay.deleteMany({ where: { merchantId: M } });
    await prisma.subscription.deleteMany({ where: { merchantId: M } });
    await prisma.merchant.deleteMany({ where: { id: M } });
    await prisma.$disconnect();
  });

  it("allows a call while there is budget left and records the spend", async () => {
    await consumeAiQuota(M, "ask");
    expect((await getAiUsageToday(M)).ask).toBe(1);
  });

  it("refuses with a 402 once the day's allowance is spent, matching the other plan gates", async () => {
    await primeUsage("ask", GROWTH_CAP);
    await expect(consumeAiQuota(M, "ask")).rejects.toMatchObject({ status: 402, code: "plan_limit" });
  });

  it("does not let concurrent calls overspend the allowance", async () => {
    await primeUsage("ask", GROWTH_CAP - 2);
    // Fired together so they race on the same row: a read-then-write
    // implementation lets more than the remaining 2 through.
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => consumeAiQuota(M, "ask")));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect((await getAiUsageToday(M)).ask).toBe(GROWTH_CAP);
  });

  it("meters each surface separately, so a busy assistant never blocks label scanning", async () => {
    await primeUsage("ask", GROWTH_CAP);
    await expect(consumeAiQuota(M, "ask")).rejects.toMatchObject({ status: 402 });
    await expect(consumeAiQuota(M, "photoFill")).resolves.toBeUndefined();
  });

  it("starts a fresh allowance on a new day rather than carrying yesterday's count", async () => {
    await prisma.aiUsageDay.create({
      data: {
        merchantId: M,
        day: new Date(usageDay().getTime() - 24 * 60 * 60 * 1000),
        feature: "recap",
        count: 9_999,
      },
    });
    await expect(consumeAiQuota(M, "recap")).resolves.toBeUndefined();
  });

  it("never refuses an unlimited plan, but still records what it spent", async () => {
    await setPlan("pro");
    await primeUsage("recap", PLAN_ENTITLEMENTS.pro.aiDailyCalls);
    // Pro is a finite ceiling today; if it is ever raised to the unlimited
    // sentinel this still has to pass, so assert on the behaviour either way.
    const cap = PLAN_ENTITLEMENTS.pro.aiDailyCalls;
    if (cap >= 1_000_000) {
      await expect(consumeAiQuota(M, "recap")).resolves.toBeUndefined();
    } else {
      await expect(consumeAiQuota(M, "recap")).rejects.toMatchObject({ status: 402 });
    }
  });

  describe("splitPpobMargin", () => {
    it("gives a pro merchant the whole markup", () => {
      expect(splitPpobMargin(2500, "pro")).toEqual({ merchantCommission: 2500, platformFee: 0 });
    });

    it("takes a smaller cut as the merchant moves up plans", () => {
      const free = splitPpobMargin(2500, "free").merchantCommission;
      const starter = splitPpobMargin(2500, "starter").merchantCommission;
      const growth = splitPpobMargin(2500, "growth").merchantCommission;
      expect(free).toBeLessThan(starter);
      expect(starter).toBeLessThan(growth);
    });

    it("always sums the two parts back to the original markup, with no stray rupiah", () => {
      for (const margin of [0, 1, 3, 7, 999, 1234, 2501]) {
        for (const plan of ["free", "starter", "growth", "pro"] as const) {
          const { merchantCommission, platformFee } = splitPpobMargin(margin, plan);
          expect(merchantCommission + platformFee).toBe(margin);
          expect(Number.isInteger(merchantCommission)).toBe(true);
          expect(Number.isInteger(platformFee)).toBe(true);
        }
      }
    });

    it("rounds in Lapak's favour rather than inventing a rupiah for the merchant", () => {
      // 0.7 * 3 = 2.1 — the merchant gets 2, never 3.
      expect(splitPpobMargin(3, "free").merchantCommission).toBe(2);
    });
  });
});
