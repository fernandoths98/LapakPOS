import { CreateSaleRequest } from "@lapak/shared";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../utils/errors";
import * as salesService from "../sales.service";

const TEST_MERCHANT_ID = "00000000-0000-0000-0000-000000000097";
const TEST_OUTLET_ID = "00000000-0000-0000-0000-000000000297";
const TEST_USER_ID = "00000000-0000-0000-0000-000000000197";

const outletStock = (productId: string) =>
  prisma.outletProduct
    .findUniqueOrThrow({ where: { outletId_productId: { outletId: TEST_OUTLET_ID, productId } } })
    .then((op) => op.stockQty);

describe("sales.service", () => {
  let productId: string;

  beforeAll(async () => {
    await prisma.merchant.upsert({
      where: { id: TEST_MERCHANT_ID },
      update: {},
      create: { id: TEST_MERCHANT_ID, name: "Sales Test Merchant" },
    });

    await prisma.outlet.upsert({
      where: { id: TEST_OUTLET_ID },
      update: {},
      create: { id: TEST_OUTLET_ID, merchantId: TEST_MERCHANT_ID, name: "Sales Test Outlet", code: "UTAMA", isPrimary: true },
    });

    await prisma.user.upsert({
      where: { id: TEST_USER_ID },
      update: { merchantId: TEST_MERCHANT_ID, outletId: TEST_OUTLET_ID },
      create: {
        id: TEST_USER_ID,
        merchantId: TEST_MERCHANT_ID,
        outletId: TEST_OUTLET_ID,
        name: "Test Cashier",
        email: "sales-service-test@lapak.test",
        passwordHash: "not-a-real-hash",
        role: "cashier",
      },
    });

    const product = await prisma.product.create({
      data: {
        merchantId: TEST_MERCHANT_ID,
        name: "Test Product",
        sellPrice: 10000,
        costPrice: 6000,
        stockQty: 5,
        outletProducts: { create: { outletId: TEST_OUTLET_ID, stockQty: 5 } },
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await prisma.saleLineItem.deleteMany({ where: { sale: { merchantId: TEST_MERCHANT_ID } } });
    await prisma.sale.deleteMany({ where: { merchantId: TEST_MERCHANT_ID } });
    await prisma.expense.deleteMany({ where: { merchantId: TEST_MERCHANT_ID } });
    await prisma.shift.deleteMany({ where: { merchantId: TEST_MERCHANT_ID } });
    await prisma.outletProduct.deleteMany({ where: { product: { merchantId: TEST_MERCHANT_ID } } });
    await prisma.product.deleteMany({ where: { merchantId: TEST_MERCHANT_ID } });
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
    await prisma.outlet.deleteMany({ where: { merchantId: TEST_MERCHANT_ID } });
    await prisma.merchant.deleteMany({ where: { id: TEST_MERCHANT_ID } });
    await prisma.$disconnect();
  });

  it("opens a shift, prices from the live product, and decrements stock", async () => {
    const clientId = uuidv4();
    const body: CreateSaleRequest = {
      clientId,
      lineItems: [{ productId, qty: 2 }],
      tenderType: "cash",
      cashAmount: 20000,
      qrisAmount: 0,
    };

    const sale = await salesService.createSale(TEST_MERCHANT_ID, TEST_USER_ID, TEST_OUTLET_ID, body);

    expect(sale.subtotal).toBe(20000);
    expect(sale.total).toBe(20000);
    expect(sale.outletId).toBe(TEST_OUTLET_ID);
    expect(sale.lineItems).toHaveLength(1);
    expect(sale.lineItems[0].unitPrice).toBe(10000);
    expect(sale.lineItems[0].productName).toBe("Test Product");

    const shift = await prisma.shift.findFirst({ where: { id: sale.shiftId } });
    expect(shift?.status).toBe("open");
    expect(shift?.openingFloat).toBe(0);
    expect(shift?.outletId).toBe(TEST_OUTLET_ID);

    expect(await outletStock(productId)).toBe(3);
  });

  it("reuses the same open shift for a second sale by the same user", async () => {
    const body: CreateSaleRequest = {
      clientId: uuidv4(),
      lineItems: [{ productId, qty: 1 }],
      tenderType: "qris",
      cashAmount: 0,
      qrisAmount: 10000,
    };
    const sale = await salesService.createSale(TEST_MERCHANT_ID, TEST_USER_ID, TEST_OUTLET_ID, body);

    const openShifts = await prisma.shift.findMany({
      where: { merchantId: TEST_MERCHANT_ID, outletId: TEST_OUTLET_ID, userId: TEST_USER_ID, status: "open" },
    });
    expect(openShifts).toHaveLength(1);
    expect(sale.shiftId).toBe(openShifts[0].id);
  });

  it("is idempotent on clientId: a repeated request returns the same sale without decrementing stock again", async () => {
    const clientId = uuidv4();
    const body: CreateSaleRequest = {
      clientId,
      lineItems: [{ productId, qty: 1 }],
      tenderType: "cash",
      cashAmount: 10000,
      qrisAmount: 0,
    };

    const first = await salesService.createSale(TEST_MERCHANT_ID, TEST_USER_ID, TEST_OUTLET_ID, body);
    const stockAfterFirst = await outletStock(productId);

    const second = await salesService.createSale(TEST_MERCHANT_ID, TEST_USER_ID, TEST_OUTLET_ID, body);
    const stockAfterSecond = await outletStock(productId);

    expect(second.id).toBe(first.id);
    expect(second.createdAt).toBe(first.createdAt);
    expect(stockAfterSecond).toBe(stockAfterFirst);
  });

  it("rejects overselling past the available stock", async () => {
    const body: CreateSaleRequest = {
      clientId: uuidv4(),
      lineItems: [{ productId, qty: 999 }],
      tenderType: "cash",
      cashAmount: 9990000,
      qrisAmount: 0,
    };
    await expect(salesService.createSale(TEST_MERCHANT_ID, TEST_USER_ID, TEST_OUTLET_ID, body)).rejects.toBeInstanceOf(AppError);
  });

  it("rejects a cash sale whose cashAmount doesn't match the total", async () => {
    const body: CreateSaleRequest = {
      clientId: uuidv4(),
      lineItems: [{ productId, qty: 1 }],
      tenderType: "cash",
      cashAmount: 5000,
      qrisAmount: 0,
    };
    await expect(salesService.createSale(TEST_MERCHANT_ID, TEST_USER_ID, TEST_OUTLET_ID, body)).rejects.toMatchObject({
      status: 400,
    });
  });

  it("rejects a split sale whose cash+qris doesn't add up to the total", async () => {
    const body: CreateSaleRequest = {
      clientId: uuidv4(),
      lineItems: [{ productId, qty: 1 }],
      tenderType: "split",
      cashAmount: 3000,
      qrisAmount: 3000,
    };
    await expect(salesService.createSale(TEST_MERCHANT_ID, TEST_USER_ID, TEST_OUTLET_ID, body)).rejects.toMatchObject({
      status: 400,
    });
  });

  it("rejects a negative discount", async () => {
    const body: CreateSaleRequest = {
      clientId: uuidv4(),
      lineItems: [{ productId, qty: 1 }],
      tenderType: "cash",
      cashAmount: 11000,
      qrisAmount: 0,
      discount: -1000,
    };
    await expect(salesService.createSale(TEST_MERCHANT_ID, TEST_USER_ID, TEST_OUTLET_ID, body)).rejects.toMatchObject({ status: 400 });
  });

  it("rejects a discount greater than the subtotal", async () => {
    const body: CreateSaleRequest = {
      clientId: uuidv4(),
      lineItems: [{ productId, qty: 1 }],
      tenderType: "cash",
      cashAmount: 0,
      qrisAmount: 0,
      discount: 10001,
    };
    await expect(salesService.createSale(TEST_MERCHANT_ID, TEST_USER_ID, TEST_OUTLET_ID, body)).rejects.toMatchObject({ status: 400 });
  });

  it("fetches a sale by id with its line items", async () => {
    const body: CreateSaleRequest = {
      clientId: uuidv4(),
      lineItems: [{ productId, qty: 1 }],
      tenderType: "debit",
      cashAmount: 0,
      qrisAmount: 0,
    };
    const created = await salesService.createSale(TEST_MERCHANT_ID, TEST_USER_ID, TEST_OUTLET_ID, body);
    const fetched = await salesService.getSaleById(TEST_MERCHANT_ID, created.id);
    expect(fetched.id).toBe(created.id);
    expect(fetched.lineItems).toHaveLength(1);
  });
});
