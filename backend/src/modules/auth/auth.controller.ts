import { Request, Response } from "express";
import { z } from "zod";
import { unauthorized } from "../../utils/errors";
import * as authService from "./auth.service";

const loginSchema = z.object({
  email: z.string().email().max(160),
  password: z.string().min(1, "Password is required").max(200),
});

const registerSchema = z.object({
  ownerName: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  businessName: z.string().trim().min(2).max(100),
  businessType: z.enum(["retail", "restaurant"]),
  phone: z.string().trim().min(8).max(24),
  address: z.string().trim().max(240).optional(),
});
const pinLoginSchema = z.object({ businessSlug: z.string().trim().min(3).max(60), outletCode: z.string().trim().min(2).max(20), pin: z.string().regex(/^\d{4,6}$/) });

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const { email, password } = loginSchema.parse(req.body);
  const result = await authService.login(email, password);
  res.json(result);
}

export async function registerHandler(req: Request, res: Response): Promise<void> {
  const input = registerSchema.parse(req.body);
  const result = await authService.register(input);
  res.status(201).json(result);
}
export async function pinLoginHandler(req: Request, res: Response): Promise<void> {
  res.json(await authService.loginWithPin(pinLoginSchema.parse(req.body)));
}

export async function meHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw unauthorized();
  }
  const user = await authService.getUserById(req.user.userId);
  res.json({ user });
}
