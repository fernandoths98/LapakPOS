import { v4 as uuidv4 } from "uuid";
import { prisma } from "../../../db/prisma";
import * as recapService from "../recap.service";

const TEST_MERCHANT_ID = "00000000-0000-0000-0000-000000000600";
const TEST_OUTLET_ID = "00000000-0000-0000-0000-000000000602";
const TEST_USER_ID = "00000000-0000-0000-0000-000000000601";

describe("recap.service", () => {
  let productId: string;
  let shiftId: string;

  beforeAll(async () => {
    await prisma.merchant.upsert({
      where: { id: TEST_MERCHANT_ID },
      update: {},
      create: { id: TEST_MERCHANT_ID, name: "Recap Test Merchant" },
    });
    await prisma.outlet.upsert({
      where: { id: TEST_OUTLET_ID },
      update: {},
      create: { id: TEST_OUTLET_ID, merchantId: TEST_MERCHANT_ID, name: "Recap Test Outlet", code: "UTAMA", isPrimary: true },
    });
    await prisma.subscription.upsert({
      where: { merchantId: TEST_MERCHANT_ID },
      update: { planCode: "pro", status: "active" },
      create: { merchantId: TEST_MERCHANT_ID, planCode: "pro", status: "active" },
    });

    await prisma.user.upsert({
      where: { id: TEST_USER_ID },
      update: { merchantId: TEST_MERCHANT_ID, outletId: TEST_OUTLET_ID },
      create: {
        id: TEST_USER_ID,
        merchantId: TEST_MERCHANT_ID,
        outletId: TEST_OUTLET_ID,
        name: "Test Cashier",
        email: "recap-service-test@lapak.test",
        passwordHash: "not-a-real-hash",
        role: "cashier",
      },
    });

    const product = await prisma.product.create({
      data: {
        merchantId: TEST_MERCHANT_ID,
        name: "Recap Test Coffee",
        sellPrice: 18000,
        costPrice: 11000,
        stockQty: 40,
      },
    });
    productId = product.id;

    const shift = await prisma.shift.create({
      data: { merchantId: TEST_MERCHANT_ID, outletId: TEST_OUTLET_ID, userId: TEST_USER_ID, openingFloat: 0 },
    });
    shiftId = shift.id;

    // Two sales today: 3 units + 2 units = 5 units, Rp 90.000 total.
    await prisma.sale.create({
      data: {
        merchantId: TEST_MERCHANT_ID,
        outletId: TEST_OUTLET_ID,
        shiftId,
        orderNo: "9001",
        clientId: uuidv4(),
        tenderType: "cash",
        cashAmount: 54000,
        qrisAmount: 0,
        subtotal: 54000,
        total: 54000,
        lineItems: {
          create: [
            { productId, productNameSnapshot: "Recap Test Coffee", unitPriceSnapshot: 18000, qty: 3, lineTotal: 54000 },
          ],
        },
      },
    });
    await prisma.sale.create({
      data: {
        merchantId: TEST_MERCHANT_ID,
        outletId: TEST_OUTLET_ID,
        shiftId,
        orderNo: "9002",
        clientId: uuidv4(),
        tenderType: "qris",
        cashAmount: 0,
        qrisAmount: 36000,
        subtotal: 36000,
        total: 36000,
        lineItems: {
          create: [
            { productId, productNameSnapshot: "Recap Test Coffee", unitPriceSnapshot: 18000, qty: 2, lineTotal: 36000 },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.aiRecapCache.deleteMany({ where: { merchantId: TEST_MERCHANT_ID } });
    await prisma.saleLineItem.deleteMany({ where: { sale: { merchantId: TEST_MERCHANT_ID } } });
    await prisma.sale.deleteMany({ where: { merchantId: TEST_MERCHANT_ID } });
    await prisma.shift.deleteMany({ where: { merchantId: TEST_MERCHANT_ID } });
    await prisma.outletProduct.deleteMany({ where: { product: { merchantId: TEST_MERCHANT_ID } } });
    await prisma.product.deleteMany({ where: { merchantId: TEST_MERCHANT_ID } });
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
    await prisma.subscription.deleteMany({ where: { merchantId: TEST_MERCHANT_ID } });
    await prisma.outlet.deleteMany({ where: { merchantId: TEST_MERCHANT_ID } });
    await prisma.merchant.deleteMany({ where: { id: TEST_MERCHANT_ID } });
    await prisma.$disconnect();
  });

  describe("getDailyRecap — degraded path (no ANTHROPIC_API_KEY in this sandbox)", () => {
    it("returns aiAvailable:false with a real, deterministic summary reflecting actual sales", async () => {
      const result = await recapService.getDailyRecap(TEST_MERCHANT_ID);

      expect(result.aiAvailable).toBe(false);
      expect(result.headline).toContain("Rp 90.000"); // 54.000 + 36.000
      expect(result.body).toContain("2 transaksi");
      expect(result.body).toContain("Recap Test Coffee");
    });

    it("does NOT write a cache row for the degraded response", async () => {
      await recapService.getDailyRecap(TEST_MERCHANT_ID);
      const cached = await prisma.aiRecapCache.findFirst({ where: { merchantId: TEST_MERCHANT_ID } });
      expect(cached).toBeNull();
    });
  });

  describe("getWeeklyReports — pure SQL, no AI", () => {
    it("includes today's revenue in the last bar and the real top seller", async () => {
      const result = await recapService.getWeeklyReports(TEST_MERCHANT_ID);

      expect(result.bars).toHaveLength(7);
      const todaysBar = result.bars[result.bars.length - 1];
      expect(todaysBar.total).toBe(90000);
      expect(todaysBar.ppobShare).toBe(0);

      expect(result.topSellers.length).toBeGreaterThan(0);
      const coffee = result.topSellers.find((t) => t.name === "Recap Test Coffee");
      expect(coffee).toBeDefined();
      expect(coffee?.qty).toBe(5);
      // margin = revenue (90.000) - costPrice(11.000) * qty(5) = 90.000 - 55.000 = 35.000
      expect(coffee?.margin).toBe(35000);
    });
  });
});
