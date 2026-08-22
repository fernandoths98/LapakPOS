import axios from "axios";
import { randomUUID } from "crypto";
import { WalletEntryType, WalletTopupStatus } from "@prisma/client";
import { WalletLedgerItem, WalletSummaryResponse, WalletTopupResponse } from "@lapak/shared";
import { env } from "../../config/env";
import { prisma } from "../../db/prisma";
import { AppError, badRequest, notFound } from "../../utils/errors";

function topupDto(topup: { id: string; amount: number; partnerRef: string; providerRef: string | null; qrContent: string; status: WalletTopupStatus; expiresAt: Date; paidAt: Date | null; createdAt: Date }): WalletTopupResponse {
  return { ...topup, expiresAt: topup.expiresAt.toISOString(), paidAt: topup.paidAt?.toISOString() ?? null, createdAt: topup.createdAt.toISOString() };
}

export async function getWalletSummary(merchantId: string): Promise<WalletSummaryResponse> {
  await prisma.$executeRaw`
    INSERT INTO "merchant_wallets" ("merchant_id", "balance", "updated_at")
    VALUES (${merchantId}, 0, NOW())
    ON CONFLICT ("merchant_id") DO NOTHING`;
  const wallet = await prisma.merchantWallet.findUniqueOrThrow({ where: { merchantId } });
  return { balance: wallet.balance };
}

export async function getWalletLedger(merchantId: string, limit = 50): Promise<WalletLedgerItem[]> {
  const rows = await prisma.walletLedgerEntry.findMany({ where: { merchantId }, orderBy: { createdAt: "desc" }, take: Math.min(Math.max(limit, 1), 100) });
  return rows.map((row) => ({ ...row, type: row.type, createdAt: row.createdAt.toISOString() }));
}

export async function getTopups(merchantId: string, limit = 20): Promise<WalletTopupResponse[]> {
  await prisma.walletTopup.updateMany({ where: { merchantId, status: "pending", expiresAt: { lt: new Date() } }, data: { status: "expired" } });
  const pending = await prisma.walletTopup.findMany({ where: { merchantId, status: "pending", expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, take: 3 });
  await Promise.all(pending.map(reconcileTopup).map((promise) => promise.catch(() => undefined)));
  const rows = await prisma.walletTopup.findMany({ where: { merchantId }, orderBy: { createdAt: "desc" }, take: Math.min(Math.max(limit, 1), 100) });
  return rows.map(topupDto);
}

async function reconcileTopup(topup: { partnerRef: string; providerRef: string | null; amount: number }): Promise<void> {
  const response = await axios.post(`${env.NUSAPAY_INTERNAL_URL.replace(/\/$/, "")}/api/v1/qr/qr-mpm-query`, {
    originalPartnerReferenceNo: topup.partnerRef,
    ...(topup.providerRef ? { originalReferenceNo: topup.providerRef } : {}),
    serviceCode: "47",
  }, { timeout: 15_000 });
  const data = response.data as Record<string, unknown>;
  if (String(data.latestTransactionStatus ?? "") !== "00") return;
  const responseAmount = data.amount && typeof data.amount === "object" ? Number((data.amount as { value?: unknown }).value) : topup.amount;
  await applyNusapayPayment({
    partnerRef: topup.partnerRef,
    amount: Math.trunc(responseAmount),
    providerRef: data.originalReferenceNo ? String(data.originalReferenceNo) : topup.providerRef ?? undefined,
    paidAt: data.paidTime ? String(data.paidTime) : undefined,
  });
}

export async function createTopup(merchantId: string, amount: number): Promise<WalletTopupResponse> {
  if (!Number.isInteger(amount) || amount < 10_000 || amount > 10_000_000) throw badRequest("Top-up must be between Rp10.000 and Rp10.000.000");
  const partnerRef = `LPK-${randomUUID().replace(/-/g, "").slice(0, 24).toUpperCase()}`;
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  let data: Record<string, unknown>;
  try {
    const response = await axios.post(`${env.NUSAPAY_INTERNAL_URL.replace(/\/$/, "")}/api/v1/qr/qr-mpm-generate`, {
      partnerReferenceNo: partnerRef,
      amount: { value: `${amount}.00`, currency: "IDR" },
      additionalInfo: { description: `Top up saldo LapakPOS ${partnerRef}`, lapakMerchantId: merchantId },
    }, { timeout: 20_000 });
    data = response.data as Record<string, unknown>;
  } catch (error) {
    throw new AppError(502, "nusapay_unavailable", axios.isAxiosError(error) ? String(error.response?.data?.responseMessage ?? error.message) : "NusaPay is unavailable");
  }
  const qrContent = String(data.qrContent ?? data.qrString ?? "");
  if (!qrContent) throw new AppError(502, "nusapay_invalid_response", "NusaPay did not return QR content");
  const topup = await prisma.walletTopup.create({ data: { merchantId, amount, partnerRef, providerRef: data.referenceNo ? String(data.referenceNo) : null, qrContent, expiresAt } });
  return topupDto(topup);
}

export async function applyNusapayPayment(input: { partnerRef: string; amount: number; providerRef?: string; paidAt?: string }): Promise<"credited" | "duplicate" | "ignored"> {
  if (!input.partnerRef.startsWith("LPK-")) return "ignored";
  return prisma.$transaction(async (tx) => {
    const topup = await tx.walletTopup.findUnique({ where: { partnerRef: input.partnerRef } });
    if (!topup) throw notFound("Wallet top-up");
    if (topup.status === "paid") return "duplicate";
    if (topup.status !== "pending") throw badRequest("This top-up is no longer payable");
    if (topup.amount !== input.amount) throw badRequest("Paid amount does not match the top-up amount");
    const updated = await tx.walletTopup.updateMany({ where: { id: topup.id, status: "pending" }, data: { status: "paid", providerRef: input.providerRef ?? topup.providerRef, paidAt: input.paidAt ? new Date(input.paidAt) : new Date() } });
    if (updated.count === 0) return "duplicate";
    const [wallet] = await tx.$queryRaw<Array<{ balance: number }>>`
      INSERT INTO "merchant_wallets" ("merchant_id", "balance", "updated_at")
      VALUES (${topup.merchantId}, ${topup.amount}, NOW())
      ON CONFLICT ("merchant_id") DO UPDATE SET "balance" = "merchant_wallets"."balance" + ${topup.amount}, "updated_at" = NOW()
      RETURNING "balance"`;
    await tx.walletLedgerEntry.create({ data: { merchantId: topup.merchantId, type: "topup_credit", amount: topup.amount, balanceAfter: wallet.balance, reference: `topup:${topup.partnerRef}`, description: "Top up saldo via NusaPay QRIS" } });
    return "credited";
  });
}

export async function debitWallet(merchantId: string, amount: number, reference: string, description: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const duplicate = await tx.walletLedgerEntry.findUnique({ where: { reference } });
    if (duplicate) return;
    const [wallet] = await tx.$queryRaw<Array<{ balance: number }>>`
      UPDATE "merchant_wallets" SET "balance" = "balance" - ${amount}, "updated_at" = NOW()
      WHERE "merchant_id" = ${merchantId} AND "balance" >= ${amount}
      RETURNING "balance"`;
    if (!wallet) throw new AppError(400, "insufficient_ppob_balance", "Saldo PPOB tidak cukup. Isi saldo sebelum melanjutkan transaksi.");
    await tx.walletLedgerEntry.create({ data: { merchantId, type: "ppob_debit", amount: -amount, balanceAfter: wallet.balance, reference, description } });
  });
}

export async function refundWallet(merchantId: string, amount: number, debitReference: string, description: string): Promise<void> {
  const reference = `${debitReference}:refund`;
  await prisma.$transaction(async (tx) => {
    if (await tx.walletLedgerEntry.findUnique({ where: { reference } })) return;
    const [wallet] = await tx.$queryRaw<Array<{ balance: number }>>`
      INSERT INTO "merchant_wallets" ("merchant_id", "balance", "updated_at") VALUES (${merchantId}, ${amount}, NOW())
      ON CONFLICT ("merchant_id") DO UPDATE SET "balance" = "merchant_wallets"."balance" + ${amount}, "updated_at" = NOW()
      RETURNING "balance"`;
    await tx.walletLedgerEntry.create({ data: { merchantId, type: "ppob_refund", amount, balanceAfter: wallet.balance, reference, description } });
  });
}
