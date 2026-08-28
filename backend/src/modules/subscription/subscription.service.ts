import axios from "axios";
import { randomUUID } from "crypto";
import {
  PLAN_BY_CODE,
  PLANS,
  PlanCode,
  SubscriptionCheckoutRequest,
  SubscriptionInvoiceResponse,
  SubscriptionPlansResponse,
} from "@lapak/shared";
import { WalletTopupStatus } from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../db/prisma";
import { AppError, badRequest, notFound } from "../../utils/errors";
import { resolvePlan } from "./entitlements.service";

const INVOICE_TTL_MS = 15 * 60_000;
const PARTNER_PREFIX = "SUB-";

function invoiceDto(row: {
  id: string;
  planCode: PlanCode;
  months: number;
  amount: number;
  partnerRef: string;
  qrContent: string;
  status: WalletTopupStatus;
  expiresAt: Date;
  paidAt: Date | null;
  createdAt: Date;
}): SubscriptionInvoiceResponse {
  return {
    id: row.id,
    planCode: row.planCode,
    months: row.months,
    amount: row.amount,
    partnerRef: row.partnerRef,
    qrContent: row.qrContent,
    status: row.status,
    expiresAt: row.expiresAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getPlans(merchantId: string): Promise<SubscriptionPlansResponse> {
  const plan = await resolvePlan(merchantId);
  return { plans: PLANS, current: plan.planCode };
}

export async function getSubscription(merchantId: string) {
  const plan = await resolvePlan(merchantId);
  return {
    planCode: plan.planCode,
    status: plan.status,
    currentPeriodEndsAt: plan.currentPeriodEndsAt?.toISOString() ?? null,
  };
}

// ── NusaPay QRIS (same internal gateway the wallet top-ups use) ───────────

async function generateNusapayQr(partnerRef: string, amount: number, description: string, merchantId: string) {
  try {
    const response = await axios.post(
      `${env.NUSAPAY_INTERNAL_URL.replace(/\/$/, "")}/api/v1/qr/qr-mpm-generate`,
      {
        partnerReferenceNo: partnerRef,
        amount: { value: `${amount}.00`, currency: "IDR" },
        additionalInfo: { description, lapakMerchantId: merchantId },
      },
      { timeout: 20_000 },
    );
    const data = response.data as Record<string, unknown>;
    const qrContent = String(data.qrContent ?? data.qrString ?? "");
    if (!qrContent) throw new AppError(502, "nusapay_invalid_response", "NusaPay tidak mengembalikan QR");
    return { qrContent, providerRef: data.referenceNo ? String(data.referenceNo) : null };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      502,
      "nusapay_unavailable",
      axios.isAxiosError(error)
        ? String(error.response?.data?.responseMessage ?? error.message)
        : "NusaPay sedang tidak tersedia",
    );
  }
}

/**
 * Creates a QRIS invoice to move onto `planCode` for `months` billing
 * periods. `free` is never a checkout target. The plan only actually changes
 * once the payment webhook (or a reconcile poll) marks the invoice paid.
 */
export async function createCheckout(
  merchantId: string,
  body: SubscriptionCheckoutRequest,
): Promise<SubscriptionInvoiceResponse> {
  const planCode = body.planCode;
  if (!PLAN_BY_CODE[planCode] || PLAN_BY_CODE[planCode].monthlyPrice <= 0) {
    throw badRequest("Pilih paket berbayar yang valid");
  }
  const months = body.months ?? 1;
  if (!Number.isInteger(months) || months < 1 || months > 12) {
    throw badRequest("Jumlah bulan harus 1–12");
  }

  const amount = PLAN_BY_CODE[planCode].monthlyPrice * months;
  const partnerRef = `${PARTNER_PREFIX}${randomUUID().replace(/-/g, "").slice(0, 24).toUpperCase()}`;
  const expiresAt = new Date(Date.now() + INVOICE_TTL_MS);

  const { qrContent, providerRef } = await generateNusapayQr(
    partnerRef,
    amount,
    `Langganan LapakPOS ${planCode} ${months} bln (${partnerRef})`,
    merchantId,
  );

  const invoice = await prisma.subscriptionInvoice.create({
    data: { merchantId, planCode, months, amount, partnerRef, providerRef, qrContent, expiresAt },
  });
  return invoiceDto(invoice);
}

async function reconcileInvoice(invoice: {
  partnerRef: string;
  providerRef: string | null;
  amount: number;
}): Promise<void> {
  const response = await axios.post(
    `${env.NUSAPAY_INTERNAL_URL.replace(/\/$/, "")}/api/v1/qr/qr-mpm-query`,
    {
      originalPartnerReferenceNo: invoice.partnerRef,
      ...(invoice.providerRef ? { originalReferenceNo: invoice.providerRef } : {}),
      serviceCode: "47",
    },
    { timeout: 15_000 },
  );
  const data = response.data as Record<string, unknown>;
  if (String(data.latestTransactionStatus ?? "") !== "00") return;
  const value =
    data.amount && typeof data.amount === "object"
      ? Number((data.amount as { value?: unknown }).value)
      : invoice.amount;
  await applySubscriptionPayment({
    partnerRef: invoice.partnerRef,
    amount: Math.trunc(value),
    providerRef: data.originalReferenceNo ? String(data.originalReferenceNo) : invoice.providerRef ?? undefined,
    paidAt: data.paidTime ? String(data.paidTime) : undefined,
  });
}

export async function getInvoices(merchantId: string, limit = 20): Promise<SubscriptionInvoiceResponse[]> {
  await prisma.subscriptionInvoice.updateMany({
    where: { merchantId, status: "pending", expiresAt: { lt: new Date() } },
    data: { status: "expired" },
  });
  const pending = await prisma.subscriptionInvoice.findMany({
    where: { merchantId, status: "pending", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: 3,
  });
  await Promise.all(pending.map((p) => reconcileInvoice(p).catch(() => undefined)));

  const rows = await prisma.subscriptionInvoice.findMany({
    where: { merchantId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
  });
  return rows.map(invoiceDto);
}

/**
 * Marks an invoice paid and activates its plan — idempotent, amount-checked,
 * and safe to call from both the webhook and the reconcile poll. Extends the
 * period from whichever is later: now, or the current period end.
 */
export async function applySubscriptionPayment(input: {
  partnerRef: string;
  amount: number;
  providerRef?: string;
  paidAt?: string;
}): Promise<"activated" | "duplicate" | "ignored"> {
  if (!input.partnerRef.startsWith(PARTNER_PREFIX)) return "ignored";

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.subscriptionInvoice.findUnique({ where: { partnerRef: input.partnerRef } });
    if (!invoice) throw notFound("Subscription invoice");
    if (invoice.status === "paid") return "duplicate";
    if (invoice.status !== "pending") throw badRequest("Invoice ini sudah tidak bisa dibayar");
    if (invoice.amount !== input.amount) throw badRequest("Nominal pembayaran tidak sesuai tagihan");

    const updated = await tx.subscriptionInvoice.updateMany({
      where: { id: invoice.id, status: "pending" },
      data: {
        status: "paid",
        providerRef: input.providerRef ?? invoice.providerRef,
        paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
      },
    });
    if (updated.count === 0) return "duplicate";

    const existing = await tx.subscription.findUnique({ where: { merchantId: invoice.merchantId } });
    const base = existing?.currentPeriodEndsAt && existing.currentPeriodEndsAt > new Date()
      ? existing.currentPeriodEndsAt
      : new Date();
    const periodEnd = new Date(base);
    periodEnd.setMonth(periodEnd.getMonth() + invoice.months);

    await tx.subscription.upsert({
      where: { merchantId: invoice.merchantId },
      update: { planCode: invoice.planCode, status: "active", currentPeriodEndsAt: periodEnd, trialEndsAt: null },
      create: {
        merchantId: invoice.merchantId,
        planCode: invoice.planCode,
        status: "active",
        currentPeriodEndsAt: periodEnd,
      },
    });

    return "activated";
  });
}
