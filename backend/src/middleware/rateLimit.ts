import rateLimit, { type Options } from "express-rate-limit";
import { env } from "../config/env";

const body = (code: string, message: string): Pick<Options, "handler" | "skip"> => ({
  handler: (_req, res) => {
    res.status(429).json({ error: code, message });
  },
  // The integration suite fires far more than 20 logins from one loopback
  // address; never rate-limit it.
  skip: () => env.NODE_ENV === "test",
});

/**
 * Tight limiter for the credential endpoints (login / PIN login / register).
 * Keyed by client IP — `app.set("trust proxy", 1)` makes that the real
 * client behind Traefik, not the proxy's own address. A staff PIN is only
 * 4-6 digits (10k combinations at the low end), and `loginWithPin` runs a
 * bcrypt compare per active user at the outlet, so an unthrottled endpoint
 * is both brute-forceable and a cheap DoS. 20 tries / 15 min never trips a
 * human mistyping a password but turns a full PIN sweep into days of work.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  ...body("too_many_requests", "Terlalu banyak percobaan masuk. Coba lagi dalam beberapa menit."),
});

/**
 * Loose catch-all for everything under /api — a backstop against scraping
 * and runaway clients, set well above what a busy cashier could ever
 * generate (a sale is a handful of requests).
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 240,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  ...body("too_many_requests", "Terlalu banyak permintaan. Coba lagi sebentar lagi."),
});
