import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { LoginResponse, PinLoginRequest, RegisterRequest, RegisterResponse, TRIAL_DAYS, TRIAL_PLAN_CODE, UserRole } from "@lapak/shared";
import { env } from "../../config/env";
import { prisma } from "../../db/prisma";
import { AppError, unauthorized } from "../../utils/errors";
import { v4 as uuidv4 } from "uuid";

export interface AuthTokenPayload {
  userId: string;
  merchantId: string;
  role: UserRole;
  outletId?: string | null;
}

function issueToken(user: { id: string; merchantId: string; role: UserRole; outletId?: string | null }): string {
  return jwt.sign({ userId: user.id, merchantId: user.merchantId, role: user.role, outletId: user.outletId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as SignOptions);
}

/** Verifies email/password against the stored bcrypt hash and issues a signed JWT. */
export async function login(email: string, password: string): Promise<LoginResponse> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw unauthorized("Invalid email or password");
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    throw unauthorized("Invalid email or password");
  }

  if (!user.isActive) throw unauthorized("Account is inactive");
  const token = issueToken({ id: user.id, merchantId: user.merchantId, role: user.role as UserRole, outletId: user.outletId });

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      merchantId: user.merchantId,
      outletId: user.outletId,
    },
  };
}

export async function loginWithPin(input: PinLoginRequest): Promise<LoginResponse> {
  const outlet = await prisma.outlet.findFirst({
    where: { code: input.outletCode.trim().toUpperCase(), merchant: { slug: input.businessSlug.trim().toLowerCase() } },
    include: { users: { where: { isActive: true, pinHash: { not: null } } } },
  });
  if (!outlet) throw unauthorized("Kode usaha, outlet, atau PIN salah");
  for (const user of outlet.users) {
    if (user.pinHash && await bcrypt.compare(input.pin, user.pinHash)) {
      const role = user.role as UserRole;
      return { token: issueToken({ id: user.id, merchantId: user.merchantId, role, outletId: outlet.id }), user: { id: user.id, name: user.name, email: user.email, role, merchantId: user.merchantId, outletId: outlet.id } };
    }
  }
  throw unauthorized("Kode usaha, outlet, atau PIN salah");
}

const DEFAULT_BILLERS = [
  { code: "pln", name: "PLN", sub: "Pascabayar & token", category: "electricity" as const, marginAmount: 3000 },
  { code: "pulsa", name: "Pulsa & data", sub: "Semua operator", category: "mobile" as const, marginAmount: 1500 },
  { code: "pdam", name: "PDAM", sub: "Tagihan air", category: "water" as const, marginAmount: 2500 },
  { code: "bpjs", name: "BPJS", sub: "Iuran kesehatan", category: "health_insurance" as const, marginAmount: 2500 },
  { code: "ewallet", name: "E-wallet", sub: "GoPay, OVO, DANA", category: "ewallet" as const, marginAmount: 1000 },
  { code: "internet_tv", name: "Internet & TV", sub: "Internet rumah dan TV", category: "internet_tv" as const, marginAmount: 3500 },
  { code: "games", name: "Voucher game", sub: "Mobile Legends, Free Fire, dan lainnya", category: "games" as const, marginAmount: 2000 },
  { code: "tv_voucher", name: "Voucher TV", sub: "K-Vision dan TV prabayar", category: "tv_voucher" as const, marginAmount: 2000 },
  { code: "gas", name: "Gas", sub: "Produk gas prabayar", category: "gas" as const, marginAmount: 2000 },
];

function buildSlug(name: string): string {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "toko";
  return `${base}-${uuidv4().slice(0, 6)}`;
}

/** Creates an isolated tenant, its primary outlet, owner and 14-day Starter trial atomically. */
export async function register(input: RegisterRequest): Promise<RegisterResponse> {
  const email = input.email.trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new AppError(409, "email_exists", "Email sudah terdaftar");
  }
  const [passwordHash] = await Promise.all([bcrypt.hash(input.password, 12)]);
  const slug = buildSlug(input.businessName);
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);

  const result = await prisma.$transaction(async (tx) => {
    const merchant = await tx.merchant.create({
      data: {
        name: input.businessName.trim(), slug, businessType: input.businessType,
        phone: input.phone.trim(), address: input.address?.trim() || null,
        onboardingCompleted: true, trialEndsAt,
      },
    });
    const outlet = await tx.outlet.create({
      data: { merchantId: merchant.id, name: input.businessName.trim(), code: "UTAMA", phone: input.phone.trim(), address: input.address?.trim() || null, isPrimary: true },
    });
    const user = await tx.user.create({
      data: { merchantId: merchant.id, outletId: outlet.id, name: input.ownerName.trim(), email, passwordHash, role: "owner" },
    });
    // Freemium: a fresh account gets a 14-day Starter trial, then resolvePlan
    // lazily flips it to `canceled` at trialEndsAt, which drops entitlements
    // to the free tier (existing data kept, new creates blocked at the cap).
    const subscription = await tx.subscription.create({
      data: { merchantId: merchant.id, planCode: TRIAL_PLAN_CODE, status: "trialing", trialEndsAt },
    });
    await tx.category.createMany({ data: ["Minuman", "Makanan", "Sembako"].map((name, sortOrder) => ({ merchantId: merchant.id, name, sortOrder })) });
    await tx.ppobBiller.createMany({ data: DEFAULT_BILLERS.map((biller) => ({ merchantId: merchant.id, ...biller })) });
    await tx.merchantWallet.create({ data: { merchantId: merchant.id } });
    return { merchant, outlet, user, subscription };
  });

  return {
    token: issueToken({ id: result.user.id, merchantId: result.merchant.id, role: "owner", outletId: result.outlet.id }),
    user: { id: result.user.id, name: result.user.name, email: result.user.email, role: "owner", merchantId: result.merchant.id, outletId: result.outlet.id },
    merchant: { id: result.merchant.id, name: result.merchant.name, slug, businessType: result.merchant.businessType, trialEndsAt: trialEndsAt.toISOString() },
    outlet: { id: result.outlet.id, name: result.outlet.name, code: result.outlet.code },
    subscription: { planCode: TRIAL_PLAN_CODE, status: "trialing", trialEndsAt: trialEndsAt.toISOString() },
  };
}

/** Loads the current user record for the id embedded in a verified JWT. */
export async function getUserById(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw unauthorized("User no longer exists");
  }
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    merchantId: user.merchantId,
    outletId: user.outletId,
    createdAt: user.createdAt.toISOString(),
  };
}
