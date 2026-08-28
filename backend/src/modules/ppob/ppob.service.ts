import { randomUUID } from "crypto";
import axios from "axios";
import {
  CheckBillRequest,
  CheckBillResponse,
  PayBillRequest,
  PayBillResponse,
  PPOB_CATEGORIES,
  PpobBiller as PpobBillerDto,
  PpobCommissionSummaryResponse,
  PpobTransaction as PpobTransactionDto,
} from "@lapak/shared";
import { PpobBiller, PpobTransaction } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError, badRequest, notFound } from "../../utils/errors";
import { getOrOpenCurrentShift } from "../shifts/shifts.service";
import { getPpobProvider } from "./providers";
import { env } from "../../config/env";
import { debitWallet, getWalletSummary, refundWallet } from "./wallet.service";

// ── DTOs ─────────────────────────────────────────────────────────────────

function toBillerDto(biller: PpobBiller): PpobBillerDto {
  return {
    id: biller.id,
    merchantId: biller.merchantId,
    code: biller.code,
    name: biller.name,
    sub: biller.sub,
    category: biller.category,
    marginAmount: biller.marginAmount,
    isActive: biller.isActive,
  };
}

type TransactionWithBiller = PpobTransaction & { biller: PpobBiller };

function toTransactionDto(tx: TransactionWithBiller): PpobTransactionDto {
  return {
    id: tx.id,
    merchantId: tx.merchantId,
    outletId: tx.outletId,
    billerId: tx.billerId,
    billerName: tx.biller.name,
    shiftId: tx.shiftId,
    customerNumber: tx.customerNumber,
    customerName: tx.customerName,
    billAmount: tx.billAmount,
    adminFee: tx.adminFee,
    marginAmount: tx.marginAmount,
    totalCharged: tx.totalCharged,
    providerRef: tx.providerRef,
    status: tx.status,
    createdAt: tx.createdAt.toISOString(),
  };
}

// ── Billers ──────────────────────────────────────────────────────────────

/**
 * Active billers for the merchant, ordered to match the prototype's fixed
 * grid (PLN, Pulsa & data, PDAM, BPJS, E-wallet, Internet & TV) — which is
 * exactly the order `PPOB_CATEGORIES` is declared in. The schema has no
 * sort column of its own, so this sorts in JS by that category order rather
 * than relying on incidental DB row order.
 */
export async function getBillers(merchantId: string): Promise<PpobBillerDto[]> {
  const billers = await prisma.ppobBiller.findMany({ where: { merchantId, isActive: true } });
  const rank = (category: string) => PPOB_CATEGORIES.indexOf(category as (typeof PPOB_CATEGORIES)[number]);
  return billers.sort((a, b) => rank(a.category) - rank(b.category)).map(toBillerDto);
}

export type PrepaidCategory = "mobile" | "ewallet" | "electricity" | "games" | "tv_voucher" | "gas";

const PREPAID_CATEGORY_MATCH: Record<PrepaidCategory, string[]> = {
  mobile: ["data", "pulsa", "paket sms", "aktivasi voucher", "aktivasi perdana", "masa aktif"],
  ewallet: ["e-money"],
  electricity: ["pln"],
  games: ["games"],
  tv_voucher: ["tv"],
  gas: ["gas"],
};

export async function getPrepaidProducts(category: PrepaidCategory) {
  const provider = getPpobProvider();
  if (!provider.listPrepaidProducts) return [];
  const allowed = PREPAID_CATEGORY_MATCH[category];
  return (await provider.listPrepaidProducts()).filter(product => allowed.some(value => product.category.toLowerCase().includes(value)));
}

// ── Quote store (check → charge) ────────────────────────────────────────

interface StoredQuote {
  merchantId: string;
  billerId: string;
  billerCode: string;
  customerNumber: string;
  customerName: string;
  meta: string;
  billAmount: number;
  adminFee: number;
  marginAmount: number;
  checkProviderRef: string;
  expiresAt: number;
}

/**
 * In-process quote store, not a Postgres table — same deliberate
 * simplification as catalog-io's preview store (see that module's own
 * comment): fine for a single-instance deployment, lost on restart, would
 * need Redis/Postgres-with-TTL for real horizontal scaling. A cashier
 * shouldn't sit on an open quote for long anyway (the customer is standing
 * there), so the TTL is short — a few minutes, not catalog-io's 30.
 */
const quotes = new Map<string, StoredQuote>();
const QUOTE_TTL_MS = 5 * 60 * 1000;

function sweepExpiredQuotes(): void {
  const now = Date.now();
  for (const [ref, quote] of quotes) {
    if (quote.expiresAt <= now) quotes.delete(ref);
  }
}

// unref() so this background sweep never keeps the process (or a jest run) alive.
setInterval(sweepExpiredQuotes, 60 * 1000).unref();

async function findActiveBiller(merchantId: string, billerId: string): Promise<PpobBiller> {
  const biller = await prisma.ppobBiller.findFirst({ where: { id: billerId, merchantId, isActive: true } });
  if (!biller) {
    throw notFound("Biller");
  }
  return biller;
}

// ── Check bill ───────────────────────────────────────────────────────────

/**
 * Fetches the live bill from the provider and quotes the customer an honest
 * total (bill + provider admin fee + the merchant's own margin), stashing
 * the full quote under a `checkRef` for `payBill` to redeem. Nothing is
 * charged or recorded yet — this is read-only against the provider.
 */
export async function checkBill(merchantId: string, body: CheckBillRequest): Promise<CheckBillResponse> {
  sweepExpiredQuotes();

  const customerNumber = body.customerNumber.trim();
  if (!customerNumber) {
    throw badRequest("Customer number is required");
  }

  const biller = await findActiveBiller(merchantId, body.billerId);
  const provider = getPpobProvider();
  let result;
  try {
    result = await provider.checkBill({ billerCode: biller.code, category: biller.category, customerNumber, skuCode: body.skuCode });
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (axios.isAxiosError(error)) {
      const data = error.response?.data as { data?: { message?: string }; message?: string } | undefined;
      throw new AppError(502, "ppob_provider_failed", data?.data?.message ?? data?.message ?? "Digiflazz tidak dapat memproses nomor tersebut.");
    }
    throw new AppError(502, "ppob_provider_failed", error instanceof Error ? error.message : "Layanan PPOB sedang bermasalah.");
  }

  const customerPays = result.billAmount + result.adminFee + biller.marginAmount;
  const checkRef = randomUUID();

  quotes.set(checkRef, {
    merchantId,
    billerId: biller.id,
    billerCode: biller.code,
    customerNumber,
    customerName: result.customerName,
    meta: result.meta,
    billAmount: result.billAmount,
    adminFee: result.adminFee,
    marginAmount: biller.marginAmount,
    checkProviderRef: result.providerRef,
    expiresAt: Date.now() + QUOTE_TTL_MS,
  });

  return {
    checkRef,
    customerName: result.customerName,
    meta: result.meta,
    billAmount: result.billAmount,
    adminFee: result.adminFee,
    marginAmount: biller.marginAmount,
    customerPays,
  };
}

// ── Pay bill ─────────────────────────────────────────────────────────────

/**
 * Redeems a `checkRef` from a prior `checkBill` call exactly once — a
 * missing, expired, or biller/customerNumber-mismatched ref is a 400, not a
 * silent no-op, so a stale or tampered quote can never be charged. The quote
 * is deleted as soon as it's read (before the provider call), so even two
 * concurrent requests racing on the same ref can charge at most once.
 *
 * Always records a `PpobTransaction` (success or failed) for history. Only a
 * successful payment writes a commission ledger entry — the merchant's
 * deposit/float only grows when they actually got paid their margin.
 */
export async function payBill(
  merchantId: string,
  userId: string,
  outletId: string,
  body: PayBillRequest,
): Promise<PayBillResponse> {
  sweepExpiredQuotes();

  const quote = quotes.get(body.checkRef);
  if (
    !quote ||
    quote.merchantId !== merchantId ||
    quote.billerId !== body.billerId ||
    quote.customerNumber !== body.customerNumber.trim()
  ) {
    throw badRequest("This bill check has expired or doesn't match — check the bill again before charging.");
  }
  quotes.delete(body.checkRef);

  const biller = await findActiveBiller(merchantId, quote.billerId);
  const provider = getPpobProvider();
  const walletDebitAmount = quote.billAmount + quote.adminFee;
  const walletReference =
    env.PPOB_PROVIDER === "digiflazz" && env.DIGIFLAZZ_MODE === "production"
      ? `ppob:${body.checkRef}:debit`
      : null;
  if (walletReference) await debitWallet(merchantId, walletDebitAmount, walletReference, `Pembelian ${biller.name} untuk ${quote.customerNumber}`);
  let result;
  try {
    result = await provider.payBill({
      billerCode: quote.billerCode,
      customerNumber: quote.customerNumber,
      billAmount: quote.billAmount,
      adminFee: quote.adminFee,
      checkProviderRef: quote.checkProviderRef,
    });
  } catch (error) {
    if (walletReference) await refundWallet(merchantId, walletDebitAmount, walletReference, `Refund ${biller.name}: provider tidak dapat dihubungi`);
    throw error;
  }

  const totalCharged = quote.billAmount + quote.adminFee + quote.marginAmount;

  const created = await prisma.$transaction(async (tx) => {
    const shift = await getOrOpenCurrentShift(merchantId, userId, outletId, tx);

    const transaction = await tx.ppobTransaction.create({
      data: {
        merchantId,
        outletId,
        billerId: biller.id,
        shiftId: shift.id,
        customerNumber: quote.customerNumber,
        customerName: quote.customerName,
        billAmount: quote.billAmount,
        adminFee: quote.adminFee,
        marginAmount: quote.marginAmount,
        totalCharged,
        providerRef: result.providerRef,
        status: result.status,
        walletDebitAmount: walletReference ? walletDebitAmount : 0,
        walletReference,
      },
      include: { biller: true },
    });

    if (result.status === "success") {
      await tx.ppobCommissionLedgerEntry.create({
        data: {
          merchantId,
          ppobTransactionId: transaction.id,
          commissionAmount: quote.marginAmount,
          depositDelta: 0,
        },
      });
    }

    return transaction;
  });

  if (result.status === "failed") {
    if (walletReference) await refundWallet(merchantId, walletDebitAmount, walletReference, `Refund ${biller.name}: transaksi gagal`);
    throw new AppError(
      502,
      "ppob_provider_failed",
      result.failureReason ?? "The bill payment could not be completed. Please try again.",
    );
  }

  return { transaction: toTransactionDto(created) };
}

// ── Transactions / commission summary ───────────────────────────────────

export async function getRecentTransactions(
  merchantId: string,
  outletId: string | undefined,
  limit: number,
): Promise<PpobTransactionDto[]> {
  const transactions = await prisma.ppobTransaction.findMany({
    where: { merchantId, ...(outletId ? { outletId } : {}) },
    include: { biller: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return transactions.map(toTransactionDto);
}

function resolveMonthRange(month?: string): { start: Date; end: Date } {
  const now = new Date();
  let year: number;
  let monthIndex: number; // 0-based

  if (month) {
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match) {
      throw badRequest("month must be in YYYY-MM format");
    }
    year = Number(match[1]);
    monthIndex = Number(match[2]) - 1;
  } else {
    year = now.getUTCFullYear();
    monthIndex = now.getUTCMonth();
  }

  return { start: new Date(Date.UTC(year, monthIndex, 1)), end: new Date(Date.UTC(year, monthIndex + 1, 1)) };
}

/**
 * `commissionThisMonth` sums the given month's (current month if omitted)
 * commission entries; `deposit` is the all-time running sum of every
 * successful payment's margin — the merchant's float, which only ever grows
 * here (Phase 4 doesn't build a withdrawal flow).
 */
export async function getCommissionSummary(merchantId: string, month?: string): Promise<PpobCommissionSummaryResponse> {
  const { start, end } = resolveMonthRange(month);

  const [monthAgg, wallet] = await Promise.all([
    prisma.ppobCommissionLedgerEntry.aggregate({
      where: { merchantId, createdAt: { gte: start, lt: end } },
      _sum: { commissionAmount: true },
    }),
    getWalletSummary(merchantId),
  ]);

  return {
    commissionThisMonth: monthAgg._sum.commissionAmount ?? 0,
    deposit: wallet.balance,
  };
}
