import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { LoginResponse, UserRole } from "@lapak/shared";
import { env } from "../../config/env";
import { prisma } from "../../db/prisma";
import { unauthorized } from "../../utils/errors";

export interface AuthTokenPayload {
  userId: string;
  merchantId: string;
  role: UserRole;
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

  const payload: AuthTokenPayload = {
    userId: user.id,
    merchantId: user.merchantId,
    role: user.role as UserRole,
  };

  const token = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as SignOptions);

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      merchantId: user.merchantId,
    },
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
    createdAt: user.createdAt.toISOString(),
  };
}
