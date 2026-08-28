import bcrypt from "bcryptjs";
import { AccountSetupResponse, CreateOutletRequest, CreateStaffRequest, MerchantResponse, OutletDto, StaffDto } from "@lapak/shared";
import { prisma } from "../../db/prisma";
import { assertWithinQuota } from "../subscription/entitlements.service";
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

const outletDto = (outlet: { id: string; name: string; code: string; address: string | null; phone: string | null; isPrimary: boolean; type: "owned" | "franchise"; isActive: boolean; createdAt: Date }): OutletDto => ({ ...outlet, createdAt: outlet.createdAt.toISOString() });
const staffDto = (user: { id: string; name: string; email: string; role: "owner" | "manager" | "cashier" | "stocker"; outletId: string | null; isActive: boolean; createdAt: Date }): StaffDto => ({ ...user, createdAt: user.createdAt.toISOString() });

export async function getAccountSetup(merchantId: string): Promise<AccountSetupResponse> {
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId }, include: { outlets: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] }, users: { orderBy: { createdAt: "asc" } }, subscription: true } });
  if (!merchant) throw notFound("Merchant");
  return {
    merchant: { id: merchant.id, name: merchant.name, slug: merchant.slug, businessType: merchant.businessType, onboardingCompleted: merchant.onboardingCompleted, trialEndsAt: merchant.trialEndsAt?.toISOString() ?? null },
    subscription: merchant.subscription
      ? {
          planCode: merchant.subscription.planCode,
          status: merchant.subscription.status,
          trialEndsAt: merchant.subscription.trialEndsAt?.toISOString() ?? null,
          currentPeriodEndsAt: merchant.subscription.currentPeriodEndsAt?.toISOString() ?? null,
        }
      : null,
    outlets: merchant.outlets.map(outletDto), staff: merchant.users.map(staffDto),
  };
}

export async function createOutlet(merchantId: string, input: CreateOutletRequest): Promise<OutletDto> {
  await assertWithinQuota(merchantId, "outlets");
  const outlet = await prisma.outlet.create({
    data: {
      merchantId,
      name: input.name.trim(),
      code: input.code.trim().toUpperCase(),
      address: input.address?.trim() || null,
      phone: input.phone?.trim() || null,
      type: input.type === "franchise" ? "franchise" : "owned",
    },
  });
  return outletDto(outlet);
}

export async function createStaff(merchantId: string, input: CreateStaffRequest): Promise<StaffDto> {
  await assertWithinQuota(merchantId, "staff");
  const outlet = await prisma.outlet.findFirst({ where: { id: input.outletId, merchantId }, select: { id: true } });
  if (!outlet) throw notFound("Outlet");
  const pinHash = await bcrypt.hash(input.pin, 10);
  const passwordHash = await bcrypt.hash(input.password ?? `${input.pin}-${merchantId}`, 10);
  const email = input.email?.trim().toLowerCase() || `staff-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@pin.kotdee.local`;
  const user = await prisma.user.create({ data: { merchantId, outletId: outlet.id, name: input.name.trim(), email, passwordHash, pinHash, role: input.role } });
  return staffDto(user);
}
