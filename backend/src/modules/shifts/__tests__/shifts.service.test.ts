import { v4 as uuidv4 } from "uuid";
import { prisma } from "../../../db/prisma";
import * as shiftsService from "../shifts.service";

const TEST_MERCHANT_ID = "00000000-0000-0000-0000-000000000080";
const TEST_USER_ID = "00000000-0000-0000-0000-000000000180";

describe("shifts.service", () => {
  let billerId: string;

  beforeAll(async () => {
    await prisma.merchant.upsert({
      where: { id: TEST_MERCHANT_ID },
      update: {},
      create: { id: TEST_MERCHANT_ID, name: "Shifts Test Merchant" },
    });

    await prisma.user.upsert({
      where: { id: TEST_USER_ID },
      update: { merchantId: TEST_MERCHANT_ID },
      create: {
        id: TEST_USER_ID,
        merchantId: TEST_MERCHANT_ID,
        name: "Sari",
        email: "shifts-service-test@lapak.test",
        passwordHash: "not-a-real-hash",
        role: "cashier",
      },
    });

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
    await prisma.expense.deleteMany({ where: { merchantId: TEST_MERCHANT_ID } });
    await prisma.sale.deleteMany({ where: { merchantId: TEST_MERCHANT_ID } });
    await prisma.ppobBiller.deleteMany({ where: { merchantId: TEST_MERCHANT_ID } });
    await prisma.shift.deleteMany({ where: { merchantId: TEST_MERCHANT_ID } });
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
    await prisma.merchant.deleteMany({ where: { id: TEST_MERCHANT_ID } });
    await prisma.$disconnect();
  });

  // Every test opens its own shift; this guarantees the next test starts with
  // no open shift left behind by one that (deliberately) never got closed.
  afterEach(async () => {
    await prisma.shift.updateMany({
      where: { merchantId: TEST_MERCHANT_ID, status: "open" },
      data: { status: "closed" },
    });
  });

  describe("openShift", () => {
    it("rejects opening a second shift while one is already open for the merchant", async () => {
      await shiftsService.openShift(TEST_MERCHANT_ID, TEST_USER_ID, { openingFloat: 100000 });

      await expect(
        shiftsService.openShift(TEST_MERCHANT_ID, TEST_USER_ID, { openingFloat: 50000 }),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe("closeShift arithmetic", () => {
    it("computes expected = opening + cashSales + ppobCashIn - paidOut, and discrepancy = expected - counted, exactly", async () => {
      const shift = await shiftsService.openShift(TEST_MERCHANT_ID, TEST_USER_ID, { openingFloat: 300000 });

      // Plain cash sale.
      await prisma.sale.create({
        data: {
          merchantId: TEST_MERCHANT_ID,
          shiftId: shift.id,
          orderNo: "1001",
          clientId: uuidv4(),
          tenderType: "cash",
          cashAmount: 150000,
          qrisAmount: 0,
          subtotal: 150000,
          total: 150000,
        },
      });
      // Split sale — only the cash leg should count.
      await prisma.sale.create({
        data: {
          merchantId: TEST_MERCHANT_ID,
          shiftId: shift.id,
          orderNo: "1002",
          clientId: uuidv4(),
          tenderType: "split",
          cashAmount: 40000,
          qrisAmount: 60000,
          subtotal: 100000,
          total: 100000,
        },
      });
      // Pure QRIS sale — must NOT count toward cash.
      await prisma.sale.create({
        data: {
          merchantId: TEST_MERCHANT_ID,
          shiftId: shift.id,
          orderNo: "1003",
          clientId: uuidv4(),
          tenderType: "qris",
          cashAmount: 0,
          qrisAmount: 80000,
          subtotal: 80000,
          total: 80000,
        },
      });

      // Successful PPOB payment — assumed collected in cash.
      await prisma.ppobTransaction.create({
        data: {
          merchantId: TEST_MERCHANT_ID,
          billerId,
          shiftId: shift.id,
          customerNumber: "51234488901",
          customerName: "BUDI SANTOSO",
          billAmount: 100000,
          adminFee: 2500,
          marginAmount: 3000,
          totalCharged: 105500,
          providerRef: "test-ref-success",
          status: "success",
        },
      });
      // Failed PPOB payment — must NOT count.
      await prisma.ppobTransaction.create({
        data: {
          merchantId: TEST_MERCHANT_ID,
          billerId,
          shiftId: shift.id,
          customerNumber: "0812000000",
          customerName: "SITI",
          billAmount: 50000,
          adminFee: 1500,
          marginAmount: 3000,
          totalCharged: 54500,
          providerRef: "test-ref-failed",
          status: "failed",
        },
      });

      // Expense paid out of the drawer.
      await prisma.expense.create({
        data: { merchantId: TEST_MERCHANT_ID, shiftId: shift.id, amount: 25000, note: "Gas refill", source: "manual" },
      });

      const cashSales = 150000 + 40000; // split's cash leg only, QRIS sale excluded
      const ppobCashIn = 105500; // failed transaction excluded
      const paidOut = 25000;
      const expected = 300000 + cashSales + ppobCashIn - paidOut; // 570500

      // GET /current's live preview must match this exactly before any close call.
      const preview = await shiftsService.getCurrentShift(TEST_MERCHANT_ID);
      expect(preview.shift?.id).toBe(shift.id);
      expect(preview.running).toEqual({
        openingFloat: 300000,
        cashSales,
        ppobCashIn,
        paidOut,
        expectedCash: expected,
      });

      const countedShort = expected - 15000;
      const closeResult = await shiftsService.closeShift(TEST_MERCHANT_ID, shift.id, { countedCash: countedShort });

      expect(closeResult.expectedCash).toBe(expected);
      expect(closeResult.countedCash).toBe(countedShort);
      expect(closeResult.discrepancy).toBe(15000);
      expect(closeResult.discrepancyTitle).toBe("Short by Rp 15.000");
      expect(closeResult.discrepancyBody).not.toMatch(/PLN|reclassify|19:0/); // no fabricated specific-cause explanation
      expect(closeResult.shift.status).toBe("closed");
      expect(closeResult.shift.countedCash).toBe(countedShort);
      expect(closeResult.shift.expectedCash).toBe(expected);
      expect(closeResult.shift.userName).toBe("Sari");

      // z-report reports the exact same numbers after close.
      const zReport = await shiftsService.getZReport(TEST_MERCHANT_ID, shift.id);
      expect(zReport.running.expectedCash).toBe(expected);
      expect(zReport.running.cashSales).toBe(cashSales);
      expect(zReport.running.ppobCashIn).toBe(ppobCashIn);
      expect(zReport.running.paidOut).toBe(paidOut);
      expect(zReport.discrepancy).toBe(15000);
    });

    it("reports 'Over by' when counted exceeds expected", async () => {
      const shift = await shiftsService.openShift(TEST_MERCHANT_ID, TEST_USER_ID, { openingFloat: 100000 });
      const result = await shiftsService.closeShift(TEST_MERCHANT_ID, shift.id, { countedCash: 120000 });
      expect(result.discrepancy).toBe(-20000);
      expect(result.discrepancyTitle).toBe("Over by Rp 20.000");
    });

    it("reports 'Drawer balances' when counted matches expected exactly", async () => {
      const shift = await shiftsService.openShift(TEST_MERCHANT_ID, TEST_USER_ID, { openingFloat: 200000 });
      const result = await shiftsService.closeShift(TEST_MERCHANT_ID, shift.id, { countedCash: 200000 });
      expect(result.discrepancy).toBe(0);
      expect(result.discrepancyTitle).toBe("Drawer balances");
    });

    it("falls back to the exact Phase 5a generic discrepancyBody even when a real transaction genuinely matches the gap — proving the AI-unavailable path is safe, not just the no-candidate path", async () => {
      const shift = await shiftsService.openShift(TEST_MERCHANT_ID, TEST_USER_ID, { openingFloat: 100000 });

      // A cash sale of exactly Rp 45.000 — deliberately chosen so a genuine
      // discrepancy-candidate WOULD exist (see discrepancyAi.service.test.ts
      // for that matching logic tested directly). Since this sandbox has no
      // ANTHROPIC_API_KEY (aiEnabled === false), closeShift must never reach
      // the AI-phrasing path at all, regardless of whether a candidate exists.
      await prisma.sale.create({
        data: {
          merchantId: TEST_MERCHANT_ID,
          shiftId: shift.id,
          orderNo: "2001",
          clientId: uuidv4(),
          tenderType: "cash",
          cashAmount: 45000,
          qrisAmount: 0,
          subtotal: 45000,
          total: 45000,
          lineItems: {
            create: [
              {
                productId: (
                  await prisma.product.create({
                    data: { merchantId: TEST_MERCHANT_ID, name: "Token PLN 45rb", sellPrice: 45000, costPrice: 45000, stockQty: 0 },
                  })
                ).id,
                productNameSnapshot: "Token PLN 45rb",
                unitPriceSnapshot: 45000,
                qty: 1,
                lineTotal: 45000,
              },
            ],
          },
        },
      });

      // expected = 100000 + 45000 = 145000; counted 100000 short by exactly 45000 — matches the sale exactly.
      const result = await shiftsService.closeShift(TEST_MERCHANT_ID, shift.id, { countedCash: 100000 });

      expect(result.discrepancy).toBe(45000);
      expect(result.discrepancyTitle).toBe("Short by Rp 45.000");
      // Exactly Phase 5a's generic, rule-based body — no fabricated specific-cause text.
      expect(result.discrepancyBody).toBe(
        "Counted cash is Rp 45.000 short of what today's sales, PPOB and expenses add up to. Recount the drawer or review today's transactions before closing.",
      );
      expect(result.discrepancyBody).not.toMatch(/Token PLN|19:0|reclassify/);

      await prisma.saleLineItem.deleteMany({ where: { sale: { merchantId: TEST_MERCHANT_ID, orderNo: "2001" } } });
      await prisma.product.deleteMany({ where: { merchantId: TEST_MERCHANT_ID, name: "Token PLN 45rb" } });
    });

    it("404s closing an unknown shift and 400s closing an already-closed shift", async () => {
      await expect(
        shiftsService.closeShift(TEST_MERCHANT_ID, "00000000-0000-0000-0000-000000000000", { countedCash: 0 }),
      ).rejects.toMatchObject({ status: 404 });

      const shift = await shiftsService.openShift(TEST_MERCHANT_ID, TEST_USER_ID, { openingFloat: 0 });
      await shiftsService.closeShift(TEST_MERCHANT_ID, shift.id, { countedCash: 0 });

      await expect(shiftsService.closeShift(TEST_MERCHANT_ID, shift.id, { countedCash: 0 })).rejects.toMatchObject({
        status: 400,
      });
    });
  });
});
