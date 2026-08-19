import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { loginHandler, meHandler } from "./auth.controller";

export const authRouter = Router();

authRouter.post("/login", asyncHandler(loginHandler));
authRouter.get("/me", requireAuth, asyncHandler(meHandler));
