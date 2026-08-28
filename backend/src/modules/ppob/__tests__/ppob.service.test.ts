import { prisma } from "../../../db/prisma";
import { AppError } from "../../../utils/errors";
import { CheckBillResult, PayBillResult, PpobProvider } from "../providers/PpobProvider";

// Mocked so tests control exactly what the "aggregator" returns — including
// the failure path, which the real MockPpobProvider only takes ~5% of the
// time (too flaky to assert on directly in a unit test).
jest.mock("../providers", () => ({ getPpobProvider: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getPpobProvider } = require("../providers") as { getPpobProvider: jest.Mock };

import * as ppobService from "../ppob.service";

const TEST_MERCHANT_ID = "00000000-0000-0000-0000-000000000070";
const OTHER_MERCHANT_ID = "00000000-0000-0000-0000-000000000071";
const TEST_OUTLET_ID = "00000000-0000-0000-0000-000000000270";
const TEST_USER_ID = "00000000-0000-0000-0000-000000000170";

function fakeProvider(overrides?: { checkBill?: Partial<CheckBillResult>; payBill?: Partial<PayBillResult> }): PpobProvider {
  return {
    checkBill: jest.fn().mockResolvedValue({
      customerName: "BUDI SANTOSO",
      meta: "R1/1300VA · period Jul 2026",
      billAmount: 287400,
      adminFee: 2500,
      providerRef: "test-check-ref",
      ...overrides?.checkBill,
    }),
    payBill: jest.fn().mockResolvedValue({
      status: "success",
      providerRef: "test-pay-ref",
      paidAt: new Date().toISOString(),
      ...overrides?.payBill,
    }),
  };
}

describe("ppob.service", () => {
  let billerId: string;

  beforeAll(async () => {
    await prisma.merchant.upsert({
      where: { id: TEST_MERCHANT_ID },
      update: {},
      create: { id: TEST_MERCHANT_ID, name: "PPOB Test Merchant" },
    });
    await prisma.merchant.upsert({
      where: { id: OTHER_MERCHANT_ID },
      update: {},
      create: { id: OTHER_MERCHANT_ID, name: "PPOB Other Merchant" },
    });
    await prisma.outlet.upsert({
      where: { id: TEST_OUTLET_ID },
      update: {},
      create: { id: TEST_OUTLET_ID, merchantId: TEST_MERCHANT_ID, name: "PPOB Test Outlet", code: "UTAMA", isPrimary: true },
    });
    await prisma.user.upsert({
      where: { id: TEST_USER_ID },
      update: { merchantId: TEST_MERCHANT_ID, outletId: TEST_OUTLET_ID },
      create: {
        id: TEST_USER_ID,
        merchantId: TEST_MERCHANT_ID,
        outletId: TEST_OUTLET_ID,
        name: "Test Cashier",
        email: "ppob-service-test@lapak.test",
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

    // A second, inactive biller — should never surface from getBillers.
    await prisma.ppobBiller.upsert({
      where: { merchantId_code: { merchantId: TEST_MERCHANT_ID, code: "retired" } },
      update: { isActive: false },
      create: {
        merchantId: TEST_MERCHANT_ID,
        code: "retired",
        name: "Retired biller",
        sub: "n/a",
        category: "mobile",
        marginAmount: 1000,
        isActive: false,
      },
    });
  });

  afterAll(async () => {
    const merchantIds = { in: [TEST_MERCHANT_ID, OTHER_MERCHANT_ID] };
    await prisma.ppobCommissionLedgerEntry.deleteMany({ where: { merchantId: merchantIds } });
    await prisma.ppobTransaction.deleteMany({ where: { merchantId: merchantIds } });
    await prisma.ppobBiller.deleteMany({ where: { merchantId: merchantIds } });
    await prisma.shift.deleteMany({ where: { merchantId: merchantIds } });
    await prisma.walletLedgerEntry.deleteMany({ where: { merchantId: merchantIds } }).catch(() => undefined);
    await prisma.walletTopup.deleteMany({ where: { merchantId: merchantIds } }).catch(() => undefined);
    await prisma.merchantWallet.deleteMany({ where: { merchantId: merchantIds } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
    await prisma.outlet.deleteMany({ where: { merchantId: merchantIds } });
    await prisma.merchant.deleteMany({ where: { id: merchantIds } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    getPpobProvider.mockReset();
  });

  describe("getBillers", () => {
    it("returns only active billers for the merchant", async () => {
      const billers = await ppobService.getBillers(TEST_MERCHANT_ID);
      expect(billers.map((b) => b.code)).toEqual(["pln"]);
    });
  });

  describe("checkBill", () => {
    it("quotes customerPays = billAmount + adminFee + biller margin, exactly", async () => {
      getPpobProvider.mockReturnValue(fakeProvider());
      const result = await ppobService.checkBill(TEST_MERCHANT_ID, { billerId, customerNumber: "51234488901" });

      expect(result.billAmount).toBe(287400);
      expect(result.adminFee).toBe(2500);
      expect(result.marginAmount).toBe(3000);
      expect(result.customerPays).toBe(287400 + 2500 + 3000);
      expect(result.customerName).toBe("BUDI SANTOSO");
      expect(result.checkRef).toBeTruthy();
    });

    it("404s for a biller that doesn't belong to this merchant", async () => {
      getPpobProvider.mockReturnValue(fakeProvider());
      await expect(
        ppobService.checkBill(OTHER_MERCHANT_ID, { billerId, customerNumber: "0800000000" }),
      ).rejects.toThrow(AppError);
    });
  });

  describe("payBill", () => {
    it("on success: creates a success transaction + a commission ledger entry, and rejects replaying the same checkRef", async () => {
      getPpobProvider.mockReturnValue(fakeProvider());
      const quote = await ppobService.checkBill(TEST_MERCHANT_ID, { billerId, customerNumber: "51234488901" });

      const { transaction } = await ppobService.payBill(TEST_MERCHANT_ID, TEST_USER_ID, TEST_OUTLET_ID, {
        billerId,
        customerNumber: "51234488901",
        checkRef: quote.checkRef,
      });

      expect(transaction.status).toBe("success");
      expect(transaction.totalCharged).toBe(quote.customerPays);
      expect(transaction.marginAmount).toBe(3000);
      expect(transaction.billerName).toBe("PLN");

      const ledgerEntry = await prisma.ppobCommissionLedgerEntry.findUnique({
        where: { ppobTransactionId: transaction.id },
      });
      expect(ledgerEntry?.commissionAmount).toBe(3000);
      // depositDelta is a legacy column left at 0 since the wallet feature
      // (migration 20260821150000_ppob_wallet) took over float tracking.
      expect(ledgerEntry?.depositDelta).toBe(0);

      // Replaying the exact same (already-redeemed) checkRef must be a real
      // 400, not a second charge — the quote was deleted the moment it was read.
      await expect(
        ppobService.payBill(TEST_MERCHANT_ID, TEST_USER_ID, TEST_OUTLET_ID, { billerId, customerNumber: "51234488901", checkRef: quote.checkRef }),
      ).rejects.toThrow(AppError);

      const chargeCount = await prisma.ppobTransaction.count({
        where: { merchantId: TEST_MERCHANT_ID, customerNumber: "51234488901", status: "success" },
      });
      expect(chargeCount).toBe(1);
    });

    it("rejects a checkRef that doesn't match the billerId/customerNumber it was quoted for", async () => {
      getPpobProvider.mockReturnValue(fakeProvider());
      const quote = await ppobService.checkBill(TEST_MERCHANT_ID, { billerId, customerNumber: "0812000000" });

      await expect(
        ppobService.payBill(TEST_MERCHANT_ID, TEST_USER_ID, TEST_OUTLET_ID, {
          billerId,
          customerNumber: "0899999999", // different customer number than the quote
          checkRef: quote.checkRef,
        }),
      ).rejects.toThrow(AppError);
    });

    it("rejects an unknown checkRef", async () => {
      await expect(
        ppobService.payBill(TEST_MERCHANT_ID, TEST_USER_ID, TEST_OUTLET_ID, {
          billerId,
          customerNumber: "0812000000",
          checkRef: "not-a-real-check-ref",
        }),
      ).rejects.toThrow(AppError);
    });

    it("on provider failure: still records a failed transaction, writes NO commission entry, and surfaces a real error", async () => {
      getPpobProvider.mockReturnValue(
        fakeProvider({ payBill: { status: "failed", failureReason: "Aggregator float exhausted for this biller" } }),
      );
      const quote = await ppobService.checkBill(TEST_MERCHANT_ID, { billerId, customerNumber: "0813123123" });

      await expect(
        ppobService.payBill(TEST_MERCHANT_ID, TEST_USER_ID, TEST_OUTLET_ID, { billerId, customerNumber: "0813123123", checkRef: quote.checkRef }),
      ).rejects.toThrow("Aggregator float exhausted for this biller");

      const failedTx = await prisma.ppobTransaction.findFirst({
        where: { merchantId: TEST_MERCHANT_ID, customerNumber: "0813123123" },
      });
      expect(failedTx?.status).toBe("failed");

      const ledgerEntry = failedTx ? await prisma.ppobCommissionLedgerEntry.findUnique({ where: { ppobTransactionId: failedTx.id } }) : null;
      expect(ledgerEntry).toBeNull();
    });
  });

  describe("getCommissionSummary", () => {
    it("sums commissionAmount for the given month; deposit reflects the wallet balance", async () => {
      const summaryNow = await ppobService.getCommissionSummary(TEST_MERCHANT_ID);
      const priorDeposit = summaryNow.deposit;

      getPpobProvider.mockReturnValue(fakeProvider());
      const quote = await ppobService.checkBill(TEST_MERCHANT_ID, { billerId, customerNumber: "0877000111" });
      await ppobService.payBill(TEST_MERCHANT_ID, TEST_USER_ID, TEST_OUTLET_ID, { billerId, customerNumber: "0877000111", checkRef: quote.checkRef });

      const currentMonth = new Date().toISOString().slice(0, 7);
      const summary = await ppobService.getCommissionSummary(TEST_MERCHANT_ID, currentMonth);
      expect(summary.commissionThisMonth).toBeGreaterThanOrEqual(3000);
      // `deposit` is now the wallet balance, not a running commission sum; a
      // mock-provider payment never debits/credits the wallet, so it's unchanged.
      expect(summary.deposit).toBe(priorDeposit);

      // A month with no activity has zero commission and the same deposit.
      const emptyMonth = await ppobService.getCommissionSummary(TEST_MERCHANT_ID, "2020-01");
      expect(emptyMonth.commissionThisMonth).toBe(0);
      expect(emptyMonth.deposit).toBe(priorDeposit);
    });

    it("rejects a malformed month", async () => {
      await expect(ppobService.getCommissionSummary(TEST_MERCHANT_ID, "not-a-month")).rejects.toThrow(AppError);
    });
  });
});
