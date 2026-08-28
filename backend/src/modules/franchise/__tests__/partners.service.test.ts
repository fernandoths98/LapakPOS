import { v4 as uuidv4 } from "uuid";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../utils/errors";
import * as partners from "../partners.service";

const FR = "00000000-0000-0000-0000-0000000000a1"; // franchisor merchant
const FE = "00000000-0000-0000-0000-0000000000a2"; // franchisee merchant
const FE_OUTLET = "00000000-0000-0000-0000-0000000002a2";
const FE_USER = "00000000-0000-0000-0000-0000000003a2";

async function setPlan(merchantId: string, planCode: "free" | "pro") {
  await prisma.subscription.upsert({
    where: { merchantId },
    update: { planCode, status: "active" },
    create: { merchantId, planCode, status: "active" },
  });
}

describe("partners.service — inter-tenant franchise", () => {
  beforeAll(async () => {
    await prisma.merchant.upsert({ where: { id: FR }, update: {}, create: { id: FR, name: "Warung Madura Berkah (Pusat)" } });
    await prisma.merchant.upsert({ where: { id: FE }, update: {}, create: { id: FE, name: "Cabang Pak Slamet" } });
    await setPlan(FR, "pro");
    await setPlan(FE, "free");
    await prisma.outlet.upsert({
      where: { id: FE_OUTLET },
      update: {},
      create: { id: FE_OUTLET, merchantId: FE, name: "Cabang Pak Slamet", code: "UTAMA", isPrimary: true },
    });
    await prisma.user.upsert({
      where: { id: FE_USER },
      update: {},
      create: { id: FE_USER, merchantId: FE, outletId: FE_OUTLET, name: "Slamet", email: "partners-test@lapak.test", passwordHash: "x", role: "owner" },
    });
  });

  afterAll(async () => {
    await prisma.franchiseePartnerStatement.deleteMany({ where: { franchisorMerchantId: FR } });
    await prisma.franchiseePartner.deleteMany({ where: { franchisorMerchantId: FR } });
    await prisma.saleLineItem.deleteMany({ where: { sale: { merchantId: FE } } });
    await prisma.sale.deleteMany({ where: { merchantId: FE } });
    await prisma.shift.deleteMany({ where: { merchantId: FE } });
    await prisma.user.deleteMany({ where: { merchantId: { in: [FR, FE] } } });
    await prisma.subscription.deleteMany({ where: { merchantId: { in: [FR, FE] } } });
    await prisma.outlet.deleteMany({ where: { merchantId: { in: [FR, FE] } } });
    await prisma.merchant.deleteMany({ where: { id: { in: [FR, FE] } } });
    await prisma.$disconnect();
  });

  it("requires the franchise feature to create an invite", async () => {
    await setPlan(FR, "free");
    await expect(partners.createPartnerInvite(FR, { royaltyPercent: 5, feeMonthly: 100_000 })).rejects.toMatchObject({ status: 402 });
    await setPlan(FR, "pro");
  });

  it("full lifecycle: invite -> redeem -> generate royalty statement", async () => {
    const invite = await partners.createPartnerInvite(FR, { label: "Pak Slamet", royaltyPercent: 6, feeMonthly: 200_000 });
    expect(invite.status).toBe("pending");
    expect(invite.joinCode).toMatch(/^FR-[A-Z2-9]{8}$/);
    expect(invite.franchiseeMerchantId).toBeNull();

    // The franchisee redeems it.
    const membership = await partners.redeemJoinCode(FE, invite.joinCode.toLowerCase());
    expect(membership.isFranchisee).toBe(true);
    expect(membership.franchisorName).toContain("Berkah");
    expect(membership.royaltyPercent).toBe(6);

    // Redeeming again (or with a used code) fails.
    await expect(partners.redeemJoinCode(FE, invite.joinCode)).rejects.toBeInstanceOf(AppError);

    // Franchisee makes some sales.
    const shift = await prisma.shift.create({ data: { merchantId: FE, outletId: FE_OUTLET, userId: FE_USER, openingFloat: 0 } });
    for (const total of [500_000, 300_000]) {
      await prisma.sale.create({
        data: {
          merchantId: FE,
          outletId: FE_OUTLET,
          shiftId: shift.id,
          orderNo: `S${total}`,
          clientId: uuidv4(),
          tenderType: "cash",
          cashAmount: total,
          qrisAmount: 0,
          subtotal: total,
          total,
          status: "completed",
          createdAt: new Date("2026-07-10T09:00:00Z"),
        },
      });
    }

    const gen = await partners.generatePartnerStatements(FR, { periodStart: "2026-07-01", periodEnd: "2026-08-01" });
    expect(gen.created).toBe(1);
    const s = gen.statements[0];
    expect(s.grossSales).toBe(800_000);
    expect(s.royaltyDue).toBe(Math.floor((800_000 * 6) / 100)); // 48000
    expect(s.feeDue).toBe(200_000);
    expect(s.totalDue).toBe(248_000);
    expect(s.franchiseeName).toContain("Slamet");

    // Franchisee can see the statement raised against it.
    const feView = await partners.getMembership(FE);
    expect(feView.statements).toHaveLength(1);
    expect(feView.statements[0].totalDue).toBe(248_000);

    // Franchisor issues then marks it paid; re-generate won't clobber it.
    await partners.setPartnerStatementStatus(FR, s.id, "issued");
    const paid = await partners.setPartnerStatementStatus(FR, s.id, "paid");
    expect(paid.status).toBe("paid");
    const regen = await partners.generatePartnerStatements(FR, { periodStart: "2026-07-01", periodEnd: "2026-08-01" });
    expect(regen.statements[0].status).toBe("paid");
    expect(regen.created).toBe(0);
    expect(regen.updated).toBe(0);
  });

  it("a merchant that isn't anyone's franchisee reports isFranchisee:false", async () => {
    const m = await partners.getMembership(FR);
    expect(m.isFranchisee).toBe(false);
    expect(m.statements).toEqual([]);
  });

  it("rejects an unknown or self join code", async () => {
    await expect(partners.redeemJoinCode(FR, "FR-NOTREAL0")).rejects.toBeInstanceOf(AppError);
    const selfInvite = await partners.createPartnerInvite(FR, { royaltyPercent: 1, feeMonthly: 0 });
    await expect(partners.redeemJoinCode(FR, selfInvite.joinCode)).rejects.toMatchObject({ status: 400 });
  });
});
