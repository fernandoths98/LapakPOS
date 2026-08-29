import { entitlementsFor, PLAN_ENTITLEMENTS } from "@lapak/shared";
import { prisma } from "../../../db/prisma";
import { assertWithinQuota, getEntitlements, requireFeature } from "../entitlements.service";

const M = "00000000-0000-0000-0000-0000000000e0";
const O = "00000000-0000-0000-0000-0000000002e0";

async function setPlan(planCode: "free" | "starter" | "growth" | "pro", status = "active") {
  await prisma.subscription.upsert({
    where: { merchantId: M },
    update: { planCode, status: status as "active" },
    create: { merchantId: M, planCode, status: status as "active" },
  });
}

describe("entitlements.service", () => {
  beforeAll(async () => {
    await prisma.merchant.upsert({ where: { id: M }, update: {}, create: { id: M, name: "Entitlements Test" } });
    await prisma.outlet.upsert({
      where: { id: O },
      update: {},
      create: { id: O, merchantId: M, name: "Entitlements Outlet", code: "UTAMA", isPrimary: true },
    });
    await prisma.user.upsert({
      where: { id: O },
      update: {},
      create: { id: O, merchantId: M, outletId: O, name: "Owner", email: "entitlements-test@lapak.test", passwordHash: "x", role: "owner" },
    });
  });

  afterAll(async () => {
    await prisma.outletProduct.deleteMany({ where: { product: { merchantId: M } } });
    await prisma.product.deleteMany({ where: { merchantId: M } });
    await prisma.user.deleteMany({ where: { merchantId: M } });
    await prisma.subscription.deleteMany({ where: { merchantId: M } });
    await prisma.outlet.deleteMany({ where: { merchantId: M } });
    await prisma.merchant.deleteMany({ where: { id: M } });
    await prisma.$disconnect();
  });

  it("entitlementsFor: canceled drops to free, past_due keeps the plan", () => {
    expect(entitlementsFor("pro", "active")).toEqual(PLAN_ENTITLEMENTS.pro);
    expect(entitlementsFor("pro", "canceled")).toEqual(PLAN_ENTITLEMENTS.free);
    expect(entitlementsFor("pro", "past_due")).toEqual(PLAN_ENTITLEMENTS.pro);
  });

  it("requireFeature: gated on free, allowed on pro", async () => {
    await setPlan("free");
    await expect(requireFeature(M, "excelIO")).rejects.toMatchObject({ status: 402, code: "plan_limit" });
    await expect(requireFeature(M, "ai")).rejects.toMatchObject({ status: 402 });
    await setPlan("pro");
    await expect(requireFeature(M, "excelIO")).resolves.toBeUndefined();
    await expect(requireFeature(M, "ai")).resolves.toBeUndefined();
  });

  it("assertWithinQuota: free caps staff at 1, pro is unlimited", async () => {
    await setPlan("free");
    // one owner already exists -> at the cap
    await expect(assertWithinQuota(M, "staff")).rejects.toMatchObject({ status: 402 });
    await setPlan("pro");
    await expect(assertWithinQuota(M, "staff")).resolves.toBeUndefined();
  });

  it("assertWithinQuota: a bulk add that would blow the free product cap is rejected", async () => {
    await setPlan("free");
    await expect(assertWithinQuota(M, "products", PLAN_ENTITLEMENTS.free.maxProducts + 1)).rejects.toMatchObject({
      status: 402,
    });
    await expect(assertWithinQuota(M, "products", 1)).resolves.toBeUndefined();
    await setPlan("starter");
    await expect(assertWithinQuota(M, "products", 10_000)).resolves.toBeUndefined();
  });

  it("getEntitlements reports plan + usage", async () => {
    await setPlan("growth");
    const res = await getEntitlements(M);
    expect(res.planCode).toBe("growth");
    expect(res.entitlements.multiOutlet).toBe(true);
    expect(res.usage.outlets).toBe(1);
    expect(res.usage.staff).toBe(1);
  });

  it("an unexpired Starter trial gets the full Starter entitlements", async () => {
    await prisma.subscription.update({
      where: { merchantId: M },
      data: { planCode: "starter", status: "trialing", trialEndsAt: new Date(Date.now() + 3 * 86_400_000) },
    });
    const res = await getEntitlements(M);
    expect(res.status).toBe("trialing");
    expect(res.entitlements.excelIO).toBe(true);
    expect(res.entitlements.maxProducts).toBe(PLAN_ENTITLEMENTS.starter.maxProducts);
  });

  it("an expired trial is ended lazily on read: entitlements drop to free and the row flips to canceled", async () => {
    await prisma.subscription.update({
      where: { merchantId: M },
      data: { planCode: "starter", status: "trialing", trialEndsAt: new Date(Date.now() - 60_000) },
    });

    const res = await getEntitlements(M);
    expect(res.status).toBe("canceled");
    expect(res.entitlements).toEqual(PLAN_ENTITLEMENTS.free);
    expect(res.trialEndsAt).not.toBeNull();

    // the read repaired the stored row, so a paid feature is now gated
    await expect(requireFeature(M, "excelIO")).rejects.toMatchObject({ status: 402 });
    const row = await prisma.subscription.findUnique({ where: { merchantId: M } });
    expect(row?.status).toBe("canceled");
  });
});
