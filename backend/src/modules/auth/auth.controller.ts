import { Request, Response } from "express";
import { z } from "zod";
import { unauthorized } from "../../utils/errors";
import * as authService from "./auth.service";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const { email, password } = loginSchema.parse(req.body);
  const result = await authService.login(email, password);
  res.json(result);
}

export async function meHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw unauthorized();
  }
  const user = await authService.getUserById(req.user.userId);
  res.json({ user });
}
