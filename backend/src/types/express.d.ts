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
    }
  }
}

export {};
