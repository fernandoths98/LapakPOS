import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { authLimiter } from "../../middleware/rateLimit";
import { loginHandler, meHandler, pinLoginHandler, registerHandler } from "./auth.controller";

export const authRouter = Router();

authRouter.post("/login", authLimiter, asyncHandler(loginHandler));
authRouter.post("/register", authLimiter, asyncHandler(registerHandler));
authRouter.post("/pin-login", authLimiter, asyncHandler(pinLoginHandler));
authRouter.get("/me", requireAuth, asyncHandler(meHandler));
