import { PpobCategory } from "@lapak/shared";

export interface CheckBillInput {
  billerCode: string;
  category: PpobCategory;
  customerNumber: string;
}

export interface CheckBillResult {
  customerName: string;
  meta: string;
  billAmount: number;
  adminFee: number;
  providerRef: string;
}

export interface PayBillInput {
  billerCode: string;
  customerNumber: string;
  billAmount: number;
  adminFee: number;
  /** The `providerRef` returned from the `checkBill` call being redeemed, so a real aggregator can tie the charge to its own quote. */
  checkProviderRef: string;
}

export interface PayBillResult {
  success: boolean;
  providerRef: string;
  paidAt: string;
  failureReason?: string;
}

/**
 * The seam between Lapak and whatever PPOB aggregator actually moves money
 * (Digiflazz, Xendit, etc). One implementation ships for now (`MockPpobProvider`,
 * config-selected via `PPOB_PROVIDER=mock`) — a real aggregator drops in later
 * as a second class implementing this same interface, selected in `index.ts`'s
 * factory, with zero changes to `ppob.service.ts` or anything above it.
 */
export interface PpobProvider {
  checkBill(input: CheckBillInput): Promise<CheckBillResult>;
  payBill(input: PayBillInput): Promise<PayBillResult>;
}
