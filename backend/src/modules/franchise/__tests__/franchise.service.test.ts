import { v4 as uuidv4 } from "uuid";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../utils/errors";
import * as franchise from "../franchise.service";
import * as inventory from "../../inventory/inventory.service";
import * as productsService from "../../products/products.service";

const M = "00000000-0000-0000-0000-0000000000f0";
const OWNED = "00000000-0000-0000-0000-0000000001f0";
const FR = "00000000-0000-0000-0000-0000000002f0";
const USER = "00000000-0000-0000-0000-0000000003f0";

describe("franchise.service + inventory price lock", () => {
  let productId: string;

  beforeAll(async () => {
    await prisma.merchant.upsert({ where: { id: M }, update: {}, create: { id: M, name: "Franchise Test" } });
    await prisma.subscription.upsert({
      where: { merchantId: M },
      update: { planCode: "pro", status: "active" },
      create: { merchantId: M, planCode: "pro", status: "active" },
    });
    await prisma.outlet.upsert({
      where: { id: OWNED },
      update: {},
      create: { id: OWNED, merchantId: M, name: "Pusat", code: "UTAMA", isPrimary: true, type: "owned" },
    });
    await prisma.outlet.upsert({
      where: { id: FR },
      update: {},
      create: { id: FR, merchantId: M, name: "Cabang Madura A", code: "MADURA-A", type: "franchise" },
    });
    await prisma.user.upsert({
      where: { id: USER },
      update: {},
      create: { id: USER, merchantId: M, outletId: OWNED, name: "Owner", email: "franchise-test@lapak.test", passwordHash: "x", role: "owner" },
    });
    const product = await prisma.product.create({
      data: {
        merchantId: M,
        name: "Nasi Bungkus",
        sellPrice: 12000,
        costPrice: 8000,
        stockQty: 0,
        outletProducts: {
          create: [
            { outletId: OWNED, stockQty: 50 },
            { outletId: FR, stockQty: 30 },
          ],
        },
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await prisma.franchiseRoyaltyStatement.deleteMany({ where: { merchantId: M } });
    await prisma.franchiseAgreement.deleteMany({ where: { merchantId: M } });
    await prisma.saleLineItem.deleteMany({ where: { sale: { merchantId: M } } });
    await prisma.sale.deleteMany({ where: { merchantId: M } });
    await prisma.shift.deleteMany({ where: { merchantId: M } });
    await prisma.outletProduct.deleteMany({ where: { product: { merchantId: M } } });
    await prisma.product.deleteMany({ where: { merchantId: M } });
    await prisma.user.deleteMany({ where: { merchantId: M } });
    await prisma.subscription.deleteMany({ where: { merchantId: M } });
    await prisma.outlet.deleteMany({ where: { merchantId: M } });
    await prisma.merchant.deleteMany({ where: { id: M } });
    await prisma.$disconnect();
  });

  it("rejects an agreement on an outlet that isn't type=franchise", async () => {
    await expect(
      franchise.upsertAgreement(M, { outletId: OWNED, royaltyPercent: 5, feeMonthly: 100_000 }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("creates and updates a franchise agreement idempotently by outlet", async () => {
    const a = await franchise.upsertAgreement(M, { outletId: FR, royaltyPercent: 5, feeMonthly: 150_000, startDate: "2026-08-01" });
    expect(a.royaltyPercent).toBe(5);
    expect(a.allowPriceOverride).toBe(false);

    const b = await franchise.upsertAgreement(M, { outletId: FR, royaltyPercent: 7, feeMonthly: 150_000, allowPriceOverride: true });
    expect(b.id).toBe(a.id);
    expect(b.royaltyPercent).toBe(7);
    expect(b.allowPriceOverride).toBe(true);
    expect(await prisma.franchiseAgreement.count({ where: { merchantId: M } })).toBe(1);
  });

  it("blocks a franchise outlet from changing the master sell price, but the owned outlet can", async () => {
    await expect(
      productsService.updateProduct(M, FR, productId, { sellPrice: 15000 }),
    ).rejects.toMatchObject({ status: 403 });

    const ok = await productsService.updateProduct(M, OWNED, productId, { sellPrice: 13000 });
    expect(ok.sellPrice).toBe(13000);
  });

  it("respects allowPriceOverride for the franchise outlet's own priceOverride", async () => {
    // agreement currently allows overrides (set in the earlier test)
    const withOverride = await inventory.updateInventory(M, FR, productId, { priceOverride: 14000 });
    expect(withOverride.priceOverride).toBe(14000);
    expect(withOverride.effectivePrice).toBe(14000);

    await franchise.upsertAgreement(M, { outletId: FR, royaltyPercent: 7, feeMonthly: 150_000, allowPriceOverride: false });
    await expect(
      inventory.updateInventory(M, FR, productId, { priceOverride: 16000 }),
    ).rejects.toMatchObject({ status: 403 });
    // stock edits still allowed
    const stockOnly = await inventory.updateInventory(M, FR, productId, { stockQty: 25 });
    expect(stockOnly.stockQty).toBe(25);
  });

  it("generates royalty statements from the franchise outlet's completed sales", async () => {
    const shift = await prisma.shift.create({ data: { merchantId: M, outletId: FR, userId: USER, openingFloat: 0 } });
    for (const total of [100_000, 60_000]) {
      await prisma.sale.create({
        data: {
          merchantId: M,
          outletId: FR,
          shiftId: shift.id,
          orderNo: `F${total}`,
          clientId: uuidv4(),
          tenderType: "cash",
          cashAmount: total,
          qrisAmount: 0,
          subtotal: total,
          total,
          createdAt: new Date("2026-08-15T10:00:00Z"),
        },
      });
    }

    const result = await franchise.generateStatements(M, { periodStart: "2026-08-01", periodEnd: "2026-09-01" });
    expect(result.statements).toHaveLength(1);
    const s = result.statements[0];
    expect(s.grossSales).toBe(160_000);
    expect(s.royaltyDue).toBe(Math.floor((160_000 * 7) / 100)); // 11200
    expect(s.feeDue).toBe(150_000);
    expect(s.totalDue).toBe(11_200 + 150_000);
    expect(s.status).toBe("draft");

    // Re-running recomputes the draft, doesn't duplicate.
    const again = await franchise.generateStatements(M, { periodStart: "2026-08-01", periodEnd: "2026-09-01" });
    expect(again.created).toBe(0);
    expect(again.updated).toBe(1);
    expect(await prisma.franchiseRoyaltyStatement.count({ where: { merchantId: M } })).toBe(1);

    // Issuing then paying is a one-way transition that stamps timestamps.
    const issued = await franchise.setStatementStatus(M, s.id, "issued");
    expect(issued.status).toBe("issued");
    expect(issued.issuedAt).not.toBeNull();
    const paid = await franchise.setStatementStatus(M, s.id, "paid");
    expect(paid.status).toBe("paid");
    expect(paid.paidAt).not.toBeNull();

    // An issued/paid statement is not clobbered by a re-generate.
    const third = await franchise.generateStatements(M, { periodStart: "2026-08-01", periodEnd: "2026-09-01" });
    expect(third.statements[0].status).toBe("paid");
  });

  it("gates the whole module behind the franchise entitlement", async () => {
    await prisma.subscription.update({ where: { merchantId: M }, data: { planCode: "growth" } });
    await expect(franchise.listAgreements(M)).rejects.toMatchObject({ status: 402 });
    await prisma.subscription.update({ where: { merchantId: M }, data: { planCode: "pro" } });
  });
});
