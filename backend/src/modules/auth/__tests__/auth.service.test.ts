import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../../db/prisma";
import { env } from "../../../config/env";
import { AppError } from "../../../utils/errors";
import * as authService from "../auth.service";

const TEST_MERCHANT_ID = "00000000-0000-0000-0000-000000000099";
const TEST_EMAIL = "auth-service-test@lapak.test";
const TEST_PASSWORD = "correct-horse-battery-staple";

describe("auth.service", () => {
  beforeAll(async () => {
    await prisma.merchant.upsert({
      where: { id: TEST_MERCHANT_ID },
      update: {},
      create: { id: TEST_MERCHANT_ID, name: "Test Merchant" },
    });

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    await prisma.user.upsert({
      where: { email: TEST_EMAIL },
      update: { passwordHash, merchantId: TEST_MERCHANT_ID, role: "owner", name: "Test Owner" },
      create: {
        merchantId: TEST_MERCHANT_ID,
        name: "Test Owner",
        email: TEST_EMAIL,
        passwordHash,
        role: "owner",
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { merchantId: TEST_MERCHANT_ID } });
    await prisma.merchant.deleteMany({ where: { id: TEST_MERCHANT_ID } });
    await prisma.$disconnect();
  });

  it("logs in successfully with the correct password and returns a valid JWT", async () => {
    const result = await authService.login(TEST_EMAIL, TEST_PASSWORD);

    expect(result.user.email).toBe(TEST_EMAIL);
    expect(result.user.role).toBe("owner");
    expect(result.user.merchantId).toBe(TEST_MERCHANT_ID);
    expect(typeof result.token).toBe("string");

    const decoded = jwt.verify(result.token, env.JWT_SECRET) as { userId: string; merchantId: string };
    expect(decoded.userId).toBe(result.user.id);
    expect(decoded.merchantId).toBe(TEST_MERCHANT_ID);
  });

  it("rejects a login with the wrong password", async () => {
    await expect(authService.login(TEST_EMAIL, "totally-wrong-password")).rejects.toBeInstanceOf(AppError);
    await expect(authService.login(TEST_EMAIL, "totally-wrong-password")).rejects.toMatchObject({
      status: 401,
    });
  });

  it("rejects a login for an email that does not exist", async () => {
    await expect(authService.login("nobody@lapak.test", TEST_PASSWORD)).rejects.toMatchObject({
      status: 401,
    });
  });

  describe("register", () => {
    const REG_EMAIL = "auth-register-test@lapak.test";
    let merchantId: string | null = null;

    afterAll(async () => {
      if (!merchantId) return;
      await prisma.ppobBiller.deleteMany({ where: { merchantId } });
      await prisma.category.deleteMany({ where: { merchantId } });
      await prisma.merchantWallet.deleteMany({ where: { merchantId } });
      await prisma.subscription.deleteMany({ where: { merchantId } });
      await prisma.user.deleteMany({ where: { merchantId } });
      await prisma.outlet.deleteMany({ where: { merchantId } });
      await prisma.merchant.deleteMany({ where: { id: merchantId } });
    });

    it("starts a fresh account on a 14-day Starter trial", async () => {
      const result = await authService.register({
        ownerName: "Reg Owner",
        email: REG_EMAIL,
        password: TEST_PASSWORD,
        businessName: "Warung Register Test",
        businessType: "retail",
        phone: "0800000000",
      });
      merchantId = result.merchant.id;

      expect(result.subscription.planCode).toBe("starter");
      expect(result.subscription.status).toBe("trialing");
      expect(result.subscription.trialEndsAt).not.toBeNull();
      expect(result.merchant.trialEndsAt).toBe(result.subscription.trialEndsAt);

      const daysOut = (new Date(result.subscription.trialEndsAt as string).getTime() - Date.now()) / 86_400_000;
      expect(daysOut).toBeGreaterThan(13);
      expect(daysOut).toBeLessThanOrEqual(14);

      const row = await prisma.subscription.findUnique({ where: { merchantId: result.merchant.id } });
      expect(row?.status).toBe("trialing");
      expect(row?.planCode).toBe("starter");
    });
  });
});
