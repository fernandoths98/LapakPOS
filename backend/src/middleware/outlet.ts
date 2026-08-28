import { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma";
import { badRequest, forbidden, unauthorized } from "../utils/errors";

/**
 * Resolves the outlet a request acts on and attaches it as `req.outletId`.
 * Runs after `requireAuth`.
 *
 *  - A cashier or stocker is pinned to the outlet on their token. Sending an
 *    `X-Outlet-Id` for any other outlet is a 403 — they cannot act elsewhere.
 *  - An owner or manager may target any active outlet of their own merchant
 *    via the `X-Outlet-Id` header (the app's outlet switcher); without the
 *    header they fall back to their token outlet, then to the primary outlet.
 *
 * The chosen outlet is always re-checked to belong to the caller's merchant
 * and to be active, so a stale or forged id can't cross a tenant boundary.
 */
export async function resolveOutlet(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.user) return next(unauthorized());

  const { merchantId, role, outletId: tokenOutletId } = req.user;
  const requested = req.header("X-Outlet-Id")?.trim() || undefined;
  const canSwitch = role === "owner" || role === "manager";

  if (requested && !canSwitch && requested !== tokenOutletId) {
    return next(forbidden("You cannot act on behalf of another outlet"));
  }

  let outletId = (canSwitch ? requested : undefined) ?? tokenOutletId ?? undefined;

  if (outletId) {
    const outlet = await prisma.outlet.findFirst({
      where: { id: outletId, merchantId, isActive: true },
      select: { id: true },
    });
    if (!outlet) return next(forbidden("Outlet not found for this merchant"));
  } else {
    const primary = await prisma.outlet.findFirst({
      where: { merchantId, isActive: true },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    if (!primary) return next(badRequest("No outlet is configured for this business yet"));
    outletId = primary.id;
  }

  req.outletId = outletId;
  next();
}

/** Reads `req.outletId`, throwing if `resolveOutlet` didn't run before this handler. */
export function requireOutlet(req: Request): string {
  if (!req.outletId) throw badRequest("No outlet context on this request");
  return req.outletId;
}
