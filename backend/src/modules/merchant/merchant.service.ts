import { MerchantResponse } from "@lapak/shared";
import { prisma } from "../../db/prisma";
import { notFound } from "../../utils/errors";

/**
 * GET /api/merchant/me — the caller's own merchant record. Home needs the
 * real merchant name/address/phone (already-seeded, real data — unlike the
 * AI/Bluetooth features this phase deliberately leaves as honest
 * placeholders), so this is a small standalone module rather than bolting a
 * "merchant" concept onto auth or another module that doesn't own it.
 */
export async function getMyMerchant(merchantId: string): Promise<MerchantResponse> {
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant) {
    throw notFound("Merchant");
  }
  return {
    id: merchant.id,
    name: merchant.name,
    address: merchant.address,
    phone: merchant.phone,
    defaultPrinterName: merchant.defaultPrinterName,
    createdAt: merchant.createdAt.toISOString(),
  };
}
