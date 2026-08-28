import { UserRole } from "@lapak/shared";

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
      user?: {
        userId: string;
        merchantId: string;
        role: UserRole;
        outletId?: string | null;
      };
      /**
       * The outlet this request acts on, set by `resolveOutlet` (runs after
       * `requireAuth`). Cashiers/stockers are pinned to their own outlet;
       * owners/managers may target another via the `X-Outlet-Id` header.
       */
      outletId?: string;
    }
  }
}

export {};
