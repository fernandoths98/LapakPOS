import { v4 as uuidv4 } from "uuid";
import { prisma } from "../../../db/prisma";
import * as shiftsService from "../shifts.service";
import { explainDiscrepancyWithAi, findDiscrepancyCandidates } from "../discrepancyAi.service";

const TEST_MERCHANT_ID = "00000000-0000-0000-0000-000000000090";
const TEST_USER_ID = "00000000-0000-0000-0000-000000000190";

describe("discrepancyAi.service", () => {
  let productId: string;
  let billerId: string;

  beforeAll(async () => {
    await prisma.merchant.upsert({
      where: { id: TEST_MERCHANT_ID },
      update: {},
      create: { id: TEST_MERCHANT_ID, name: "Discrepancy AI Test Merchant" },
    });
    await prisma.user.upsert({
      where: { id: TEST_USER_ID },
      update: { merchantId: TEST_MERCHANT_ID },
      create: {
        id: TEST_USER_ID,
        merchantId: TEST_MERCHANT_ID,
        name: "Sari",
        email: "discrepancy-ai-test@lapak.test",
        passwordHash: "not-a-real-hash",
        role: "cashier",
      },
    });
    const product = await prisma.product.create({
      data: { merchantId: TEST_MERCHANT_ID, name: "Token PLN 45rb", sellPrice: 45000, costPrice: 45000, stockQty: 0 },
    });
    productId = product.id;
    const biller = await prisma.ppobBiller.upsert({
      where: { merchantId_code: { merchantId: TEST_MERCHANT_ID, code: "pln" } },
      update: {},
      create: {
        merchantId: TEST_MERCHANT_ID,
        code: "pln",
        name: "PLN",
        sub: "Postpaid & token",
        category: "electricity",
        marginAmount: 3000,
      },
    });
    billerId = biller.id;
  });

  afterAll(async () => {
    await prisma.ppobTransaction.deleteMany({ where: { merchantId: TEST_MERCHANT_ID } });
    await prisma.saleLineItem.deleteMany({ where: { sale: { merchantId: TEST_MERCHANT_ID } } });
    await prisma.sale.deleteMany({ where: { merchantId: TEST_MERCHANT_ID } });
    await prisma.ppobBiller.deleteMany({ where: { merchantId: TEST_MERCHANT_ID } });
    await prisma.shift.deleteMany({ where: { merchantId: TEST_MERCHANT_ID } });
    await prisma.product.deleteMany({ where: { merchantId: TEST_MERCHANT_ID } });
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
    await prisma.merchant.deleteMany({ where: { id: TEST_MERCHANT_ID } });
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.shift.updateMany({ where: { merchantId: TEST_MERCHANT_ID, status: "open" }, data: { status: "closed" } });
  });

  it("matches a single cash sale whose amount equals the target exactly", async () => {
    const shift = await shiftsService.openShift(TEST_MERCHANT_ID, TEST_USER_ID, { openingFloat: 0 });
    await prisma.sale.create({
      data: {
        merchantId: TEST_MERCHANT_ID,
        shiftId: shift.id,
        orderNo: "3001",
        clientId: uuidv4(),
        tenderType: "cash",
        cashAmount: 45000,
        qrisAmount: 0,
        subtotal: 45000,
        total: 45000,
        lineItems: { create: [{ productId, productNameSnapshot: "Token PLN 45rb", unitPriceSnapshot: 45000, qty: 1, lineTotal: 45000 }] },
      },
    });

    const candidates = await findDiscrepancyCandidates(TEST_MERCHANT_ID, shift.id, 45000);

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].events).toHaveLength(1);
    expect(candidates[0].events[0].amount).toBe(45000);
    expect(candidates[0].events[0].kind).toBe("sale");
    expect(candidates[0].events[0].label).toContain("Token PLN 45rb");
  });

  it("matches a pair of events (a cash sale + a PPOB transaction) whose amounts sum to the target when no single event matches", async () => {
    const shift = await shiftsService.openShift(TEST_MERCHANT_ID, TEST_USER_ID, { openingFloat: 0 });
    await prisma.sale.create({
      data: {
        merchantId: TEST_MERCHANT_ID,
        shiftId: shift.id,
        orderNo: "3002",
        clientId: uuidv4(),
        tenderType: "cash",
        cashAmount: 20000,
        qrisAmount: 0,
        subtotal: 20000,
        total: 20000,
      },
    });
    await prisma.ppobTransaction.create({
      data: {
        merchantId: TEST_MERCHANT_ID,
        billerId,
        shiftId: shift.id,
        customerNumber: "0812000000",
        customerName: "BUDI",
        billAmount: 22000,
        adminFee: 3000,
        marginAmount: 3000,
        totalCharged: 25000,
        providerRef: "test-ref-pair",
        status: "success",
      },
    });

    // Neither 20.000 nor 25.000 alone matches 45.000 — only the pair does.
    const candidates = await findDiscrepancyCandidates(TEST_MERCHANT_ID, shift.id, 45000);

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].events).toHaveLength(2);
    expect(candidates[0].sum).toBe(45000);
    const kinds = candidates[0].events.map((e) => e.kind).sort();
    expect(kinds).toEqual(["ppob", "sale"]);
  });

  it("returns no candidates when nothing sums to the target, even approximately — never fabricates a match", async () => {
    const shift = await shiftsService.openShift(TEST_MERCHANT_ID, TEST_USER_ID, { openingFloat: 0 });
    await prisma.sale.create({
      data: {
        merchantId: TEST_MERCHANT_ID,
        shiftId: shift.id,
        orderNo: "3003",
        clientId: uuidv4(),
        tenderType: "cash",
        cashAmount: 12345,
        qrisAmount: 0,
        subtotal: 12345,
        total: 12345,
      },
    });

    const candidates = await findDiscrepancyCandidates(TEST_MERCHANT_ID, shift.id, 999999);
    expect(candidates).toEqual([]);
  });

  it("returns [] immediately for a zero-or-negative target without querying anything odd", async () => {
    const candidates = await findDiscrepancyCandidates(TEST_MERCHANT_ID, "nonexistent-shift", 0);
    expect(candidates).toEqual([]);
  });

  describe("explainDiscrepancyWithAi — degraded path (no ANTHROPIC_API_KEY in this sandbox)", () => {
    it("returns null (never throws) even when given a genuine candidate, so callers fall back to the honest generic message", async () => {
      const candidates = [
        {
          events: [{ kind: "sale" as const, amount: 45000, occurredAt: new Date(), label: "Sale of 1× Token PLN 45rb" }],
          sum: 45000,
        },
      ];
      const result = await explainDiscrepancyWithAi(45000, candidates);
      expect(result).toBeNull();
    });

    it("returns null immediately when there are no candidates, without any AI call", async () => {
      const result = await explainDiscrepancyWithAi(45000, []);
      expect(result).toBeNull();
    });
  });
});
