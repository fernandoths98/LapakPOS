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
});
