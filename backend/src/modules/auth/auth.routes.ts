import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { loginHandler, meHandler, pinLoginHandler, registerHandler } from "./auth.controller";

export const authRouter = Router();

authRouter.post("/login", asyncHandler(loginHandler));
authRouter.post("/register", asyncHandler(registerHandler));
authRouter.post("/pin-login", asyncHandler(pinLoginHandler));
authRouter.get("/me", requireAuth, asyncHandler(meHandler));
