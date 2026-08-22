import { createHmac, timingSafeEqual } from "crypto";
import { env } from "../../config/env";
import { prisma } from "../../db/prisma";
import { refundWallet } from "./wallet.service";

interface DigiflazzWebhookData {
  ref_id?: string;
  status?: string;
  rc?: string;
}

export function verifyDigiflazzSignature(rawBody: Buffer, signatureHeader?: string): boolean {
  const secret = env.DIGIFLAZZ_WEBHOOK_SECRET;
  if (!secret || !signatureHeader?.startsWith("sha1=")) return false;
  const expected = `sha1=${createHmac("sha1", secret).update(rawBody).digest("hex")}`;
  const supplied = Buffer.from(signatureHeader);
  const calculated = Buffer.from(expected);
  return supplied.length === calculated.length && timingSafeEqual(supplied, calculated);
}

export async function applyDigiflazzWebhook(data: DigiflazzWebhookData): Promise<"ignored" | "updated"> {
  if (!data.ref_id) return "ignored";
  const status = data.status === "Sukses" && data.rc === "00" ? "success" : data.status === "Gagal" ? "failed" : "pending";
  const existing = await prisma.ppobTransaction.findFirst({ where: { providerRef: data.ref_id }, include: { commissionEntry: true } });
  if (!existing || existing.status === status) return "ignored";

  await prisma.$transaction(async (tx) => {
    await tx.ppobTransaction.update({ where: { id: existing.id }, data: { status } });
    if (status === "success" && !existing.commissionEntry) {
      await tx.ppobCommissionLedgerEntry.create({
        data: {
          merchantId: existing.merchantId,
          ppobTransactionId: existing.id,
          commissionAmount: existing.marginAmount,
          depositDelta: 0,
        },
      });
    }
  });
  if (status === "failed" && existing.walletReference && existing.walletDebitAmount > 0) {
    await refundWallet(existing.merchantId, existing.walletDebitAmount, existing.walletReference, `Refund ${existing.customerNumber}: transaksi Digiflazz gagal`);
  }
  return "updated";
}
