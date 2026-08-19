import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { unauthorized } from "../utils/errors";
import { AuthTokenPayload } from "../modules/auth/auth.service";

/** Verifies the `Authorization: Bearer <token>` header and attaches `req.user`. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    next(unauthorized("Missing or malformed Authorization header"));
    return;
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
    req.user = {
      userId: payload.userId,
      merchantId: payload.merchantId,
      role: payload.role,
    };
    next();
  } catch {
    next(unauthorized("Invalid or expired token"));
  }
}
