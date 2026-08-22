import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/errors";
import axios from "axios";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: "validation_error", message: err.errors.map((e) => e.message).join("; ") });
    return;
  }
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { data?: { message?: string }; message?: string } | undefined;
    const message = data?.data?.message ?? data?.message ?? "Layanan pembayaran sedang tidak dapat memproses permintaan.";
    // Never log Axios request config: it can contain provider usernames,
    // signatures, customer numbers, and other payment credentials.
    // eslint-disable-next-line no-console
    console.error("Upstream API error", { status: err.response?.status, code: err.code, message });
    res.status(502).json({ error: "provider_error", message });
    return;
  }
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: "internal_error", message: "Something went wrong" });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "not_found", message: "Route not found" });
}
