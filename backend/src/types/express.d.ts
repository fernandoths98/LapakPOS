import { UserRole } from "@lapak/shared";

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        merchantId: string;
        role: UserRole;
      };
    }
  }
}

export {};
